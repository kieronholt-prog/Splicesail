import Foundation

struct CompletedLeg: Sendable {
    let heading: Double
    let durationSeconds: Double
    var quality: Double
    let isCloseHauled: Bool
    let meanSog: Double
    var neighborBoostApplied: Bool = false
}

/// Leg validity gating and per-leg quality scoring.
struct LegAnalyzer {
    private struct Sample {
        let heading: Double
        let cog: Double?
        let sog: Double
        let heel: Double
    }

    private var samples: [Sample] = []
    private var agreementSeconds = 0.0
    private var legStartTime: Date?
    private var heelSpikeWindow: [(time: Date, heel: Double)] = []
    private var completedLegs: [CompletedLeg] = []
    private var qualifyingLegCount = 0
    private var expectedSogKnots: Double?

    private let minValidSeconds = 5.0
    private let headingVarianceLimit = 16.0
    private let baseLeewayDegrees = 4.0

    mutating func reset() {
        samples.removeAll()
        agreementSeconds = 0
        legStartTime = nil
        heelSpikeWindow.removeAll()
        completedLegs.removeAll()
        qualifyingLegCount = 0
        expectedSogKnots = nil
    }

    var bankedQualifyingLegs: Int { qualifyingLegCount }

    mutating func beginLeg(at time: Date, heading: Double) {
        samples.removeAll()
        agreementSeconds = 0
        legStartTime = time
        samples.append(Sample(heading: heading, cog: nil, sog: 0, heel: 0))
    }

    /// Returns a completed leg when validity gate passes at tack.
    mutating func tick(
        time: Date,
        heading: Double,
        cog: Double?,
        sog: Double,
        heel: Double,
        windDegrees: Double?,
        tide: TideSetting,
        deltaSeconds: Double
    ) -> CompletedLeg? {
        pruneHeelWindow(before: time.addingTimeInterval(-8))
        heelSpikeWindow.append((time, abs(heel)))

        let sample = Sample(heading: heading, cog: cog, sog: sog, heel: heel)
        samples.append(sample)
        if samples.count > 120 {
            samples.removeFirst(samples.count - 120)
        }

        if passesValidityGate(windDegrees: windDegrees, tide: tide) {
            agreementSeconds += deltaSeconds
        } else {
            agreementSeconds = 0
        }

        return nil
    }

    mutating func finalizeLeg(
        windDegrees: Double?,
        tide: TideSetting
    ) -> CompletedLeg? {
        guard agreementSeconds >= minValidSeconds,
              let start = legStartTime else {
            samples.removeAll()
            agreementSeconds = 0
            legStartTime = nil
            return nil
        }

        let duration = Date().timeIntervalSince(start)
        let headings = samples.map(\.heading)
        guard let meanHeading = CircularHeading.mean(headings) else { return nil }

        let variance = headingCircularVariance(headings)
        let stabilityScore = max(0, 1 - variance / headingVarianceLimit)
        let durationScore = min(1, duration / 60)
        let exitScore = min(1, agreementSeconds / 10)
        let baseQuality = 0.4 * stabilityScore + 0.35 * durationScore + 0.25 * exitScore
        var quality = baseQuality

        let isCloseHauled: Bool
        if let wind = windDegrees {
            let windAngle = CircularHeading.angleBetween(meanHeading, wind)
            isCloseHauled = windAngle < 80
        } else {
            isCloseHauled = false
        }

        if duration > 45, quality > 0.7, !completedLegs.isEmpty {
            let previousIndex = completedLegs.count - 1
            var previousLeg = completedLegs[previousIndex]
            if previousLeg.durationSeconds < 20, !previousLeg.neighborBoostApplied {
                previousLeg.quality = min(1, previousLeg.quality + 0.2)
                previousLeg.neighborBoostApplied = true
                completedLegs[previousIndex] = previousLeg
            }
        }

        var receivedForwardBoost = false
        if let previous = completedLegs.last,
           duration < 20, previous.durationSeconds > 45, previous.quality > 0.7 {
            quality = min(1, quality + 0.2)
            receivedForwardBoost = true
        }

        let meanSog = samples.map(\.sog).reduce(0, +) / Double(max(samples.count, 1))
        let leg = CompletedLeg(
            heading: meanHeading,
            durationSeconds: duration,
            quality: quality,
            isCloseHauled: isCloseHauled,
            meanSog: meanSog,
            neighborBoostApplied: receivedForwardBoost
        )

        completedLegs.append(leg)
        if quality > 0.45 {
            qualifyingLegCount += 1
            let alpha = 0.2
            if let expected = expectedSogKnots {
                expectedSogKnots = expected * (1 - alpha) + meanSog * alpha
            } else {
                expectedSogKnots = meanSog
            }
        }

        samples.removeAll()
        agreementSeconds = 0
        legStartTime = nil
        return leg
    }

    func lastCompletedLeg() -> CompletedLeg? {
        completedLegs.last
    }

    func previousCompletedLeg() -> CompletedLeg? {
        guard completedLegs.count >= 2 else { return nil }
        return completedLegs[completedLegs.count - 2]
    }

    private mutating func pruneHeelWindow(before cutoff: Date) {
        heelSpikeWindow.removeAll { $0.time < cutoff }
    }

    private func heelSpikeAdjustment() -> Double {
        let peak = heelSpikeWindow.map(\.heel).max() ?? 0
        return min(8, max(0, peak - 12) * 0.4)
    }

    private func headingCircularVariance(_ headings: [Double]) -> Double {
        guard headings.count > 1 else { return 0 }
        var sumSin = 0.0
        var sumCos = 0.0
        for heading in headings {
            let radians = heading * .pi / 180
            sumSin += sin(radians)
            sumCos += cos(radians)
        }
        let n = Double(headings.count)
        let r = sqrt(sumSin * sumSin + sumCos * sumCos) / n
        let circularStd = sqrt(max(0, -2 * log(max(r, 1e-6)))) * 180 / .pi
        return circularStd * circularStd
    }

    private func passesValidityGate(windDegrees: Double?, tide: TideSetting) -> Bool {
        guard samples.count >= 3 else { return false }

        let recent = Array(samples.suffix(8))
        let headings = recent.map(\.heading)
        if headingCircularVariance(headings) > headingVarianceLimit {
            return false
        }

        guard let meanHeading = CircularHeading.mean(headings) else { return false }

        let currentComponent = tide.currentComponentKnots * 2.5
        let meanHeel = recent.map { abs($0.heel) }.reduce(0, +) / Double(recent.count)
        let leewayBand = baseLeewayDegrees + leewayFromHeel(meanHeel) + heelSpikeAdjustment() + currentComponent

        if let cog = recent.compactMap(\.cog).last {
            if CircularHeading.angleBetween(meanHeading, cog) > leewayBand {
                return false
            }
        }

        if qualifyingLegCount >= 2, let expectedSog = expectedSogKnots {
            let sogBand = 1.5 + currentComponent * 0.5
            let meanSog = recent.map(\.sog).reduce(0, +) / Double(recent.count)
            if abs(meanSog - expectedSog) > sogBand {
                return false
            }
        }

        _ = windDegrees
        return true
    }

    private func leewayFromHeel(_ heel: Double) -> Double {
        min(12, abs(heel) * 0.35)
    }
}

#if DEBUG
extension LegAnalyzer {
    mutating func testInsertCompletedLeg(_ leg: CompletedLeg) {
        completedLegs.append(leg)
    }

    func testCompletedLeg(at index: Int) -> CompletedLeg? {
        guard completedLegs.indices.contains(index) else { return nil }
        return completedLegs[index]
    }
}
#endif
