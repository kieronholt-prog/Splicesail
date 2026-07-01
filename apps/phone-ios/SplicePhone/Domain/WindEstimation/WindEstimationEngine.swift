import Foundation

/// Phone-side wind estimation, tack detection, leg analysis, and VMG computation.
final class WindEstimationEngine {
    private var settings = SailingSettingsStore.load()
    private var filter = WindKalmanFilter()
    private var tackDetector = TackDetector()
    private var legAnalyzer = LegAnalyzer()

    private var tackAngleMin = 55.0
    private var tackAngleMax = 110.0
    private var trustedTackAngles: [Double] = []
    private let tackAngleWindowSize = 20
    private let tackAngleLowerPercentile = 0.10
    private let tackAngleUpperPercentile = 0.90

    private var lastLegPair: (CompletedLeg, CompletedLeg)?
    private var clusterBuffer: [(wind: Double, r: Double)] = []
    private let clusterBufferMax = 6

    private var bigShiftOverrideLegs = 0
    private var possibleShift = false
    private var earlyWarningShiftPending = false
    private var wasSailingTooClose = false
    private var outsideCloseThresholdSince: Date?
    private let earlyWarningClearSeconds = 12.0

    private var lastAttitudeTime: Date?
    private var lastHeading: Double?
    private var lastSog = 0.0
    private var lastCog: Double?
    private var hasGpsFix = false

    var snapshot: WindEstimationSnapshot {
        buildSnapshot()
    }

    var currentSettings: SailingConditionSettings {
        settings
    }

    func updateSettings(_ newSettings: SailingConditionSettings) {
        let hadWind = filter.windDegrees
        settings = newSettings
        if let base = newSettings.baseWindDegrees {
            filter.reset(windDegrees: base, variance: 9)
        } else if hadWind == nil {
            filter = WindKalmanFilter()
        }
        SailingSettingsStore.save(settings)
    }

    func setBaseWind(_ degrees: Double) {
        settings.baseWindDegrees = CircularHeading.normalize(degrees)
        filter.reset(windDegrees: degrees, variance: 9)
        SailingSettingsStore.save(settings)
    }

    func ingestAttitude(
        heading: Double,
        heel: Double,
        turnRate: Double,
        timestamp: Date = Date()
    ) {
        let delta = lastAttitudeTime.map { timestamp.timeIntervalSince($0) } ?? 0.25
        lastAttitudeTime = timestamp
        lastHeading = heading

        if let tackExit = tackDetector.ingest(heading: heading, turnRate: turnRate, heel: heel) {
            handleTackComplete(exitHeading: tackExit)
        } else if legAnalyzer.bankedQualifyingLegs == 0, legAnalyzer.lastCompletedLeg() == nil {
            legAnalyzer.beginLeg(at: timestamp, heading: heading)
        } else {
            _ = legAnalyzer.tick(
                time: timestamp,
                heading: heading,
                cog: lastCog,
                sog: lastSog,
                heel: heel,
                windDegrees: filter.windDegrees,
                tide: settings.tide,
                deltaSeconds: max(0.05, min(delta, 1.0))
            )
        }

        checkSailingTooClose(heading: heading, timestamp: timestamp)
    }

    func ingestGps(sog: Double, cog: Double?, hasFix: Bool) {
        lastSog = sog
        lastCog = cog
        hasGpsFix = hasFix
    }

    func resetSession() {
        filter = WindKalmanFilter()
        tackDetector.reset()
        legAnalyzer.reset()
        lastLegPair = nil
        clusterBuffer.removeAll()
        bigShiftOverrideLegs = 0
        possibleShift = false
        earlyWarningShiftPending = false
        wasSailingTooClose = false
        outsideCloseThresholdSince = nil
        trustedTackAngles.removeAll()
        tackAngleMin = 55
        tackAngleMax = 110
        if let base = settings.baseWindDegrees {
            filter.reset(windDegrees: base, variance: 9)
        }
    }

    // MARK: - Private

    private func handleTackComplete(exitHeading: Double) {
        if let leg = legAnalyzer.finalizeLeg(windDegrees: filter.windDegrees, tide: settings.tide) {
            processCompletedLeg(leg)
        }
        legAnalyzer.beginLeg(at: Date(), heading: exitHeading)
    }

    private func processCompletedLeg(_ leg: CompletedLeg) {
        guard leg.isCloseHauled,
              let previous = legAnalyzer.previousCompletedLeg(),
              previous.isCloseHauled,
              let wind = filter.windDegrees,
              CircularHeading.onOppositeSidesOfWind(previous.heading, leg.heading, windFrom: wind) else {
            return
        }

        let bisector = CircularHeading.windFromTackHeadings(previous.heading, leg.heading)
        let measuredTackAngle = CircularHeading.angleBetween(previous.heading, leg.heading)
        updateTackAngleRange(measured: measuredTackAngle, trusted: leg.quality > 0.55)

        let pairQuality = (previous.quality + leg.quality) / 2
        let plausibility = tackAnglePlausibility(measuredTackAngle)
        var r = 80.0 * (1.1 - pairQuality) * (1.1 - plausibility)
        r = max(4, min(400, r))

        applyBisectorMeasurement(bisector, measurementNoise: r)
        lastLegPair = (previous, leg)

        if bigShiftOverrideLegs > 0 {
            bigShiftOverrideLegs -= 1
        }
    }

    private func applyBisectorMeasurement(_ measurement: Double, measurementNoise: Double) {
        let windSetting = settings.wind
        let relaxedOutlier = windSetting == .bigShiftExpected || bigShiftOverrideLegs > 0
        let innovation = abs(filter.innovationDegrees(to: measurement))

        var scaledR = measurementNoise
        if !relaxedOutlier, let wind = filter.windDegrees {
            let rejectThreshold = windSetting.outlierRejectDegrees
            if innovation > rejectThreshold {
                scaledR *= 1 + pow(innovation / rejectThreshold, 2)
            }
        }

        filter.predict(processNoise: windSetting.processNoiseDegreesSquared)
        filter.update(measurement: measurement, measurementNoise: scaledR)

        clusterBuffer.append((measurement, scaledR))
        if clusterBuffer.count > clusterBufferMax {
            clusterBuffer.removeFirst()
        }
        evaluateClusterAgreement()
    }

    private func evaluateClusterAgreement() {
        guard let current = filter.windDegrees else { return }
        let highR = clusterBuffer.filter { $0.r > 30 }
        guard highR.count >= effectiveClusterCount() else { return }

        let winds = highR.map(\.wind)
        guard let mean = CircularHeading.mean(winds) else { return }

        let spread = winds.map { CircularHeading.angleBetween($0, mean) }.max() ?? 0
        guard spread < 12 else { return }

        let shift = CircularHeading.signedAngle(from: current, to: mean)
        guard abs(shift) > 8 else { return }

        possibleShift = true
        let reweighted = max(8, highR.map(\.r).reduce(0, +) / Double(highR.count) * 0.35)
        filter.update(measurement: mean, measurementNoise: reweighted)
        resolvePossibleShift()
    }

    private func resolvePossibleShift() {
        possibleShift = false
        earlyWarningShiftPending = false
        outsideCloseThresholdSince = nil
        wasSailingTooClose = false
    }

    private func effectiveClusterCount() -> Int {
        if bigShiftOverrideLegs > 0 { return 2 }
        return settings.wind.clusterAgreementCount
    }

    private func tackAnglePlausibility(_ measured: Double) -> Double {
        let mid = (tackAngleMin + tackAngleMax) / 2
        let halfSpan = max(8, (tackAngleMax - tackAngleMin) / 2)
        let deviation = abs(measured - mid)
        return max(0.1, 1 - deviation / (halfSpan * 2))
    }

    private func updateTackAngleRange(measured: Double, trusted: Bool) {
        guard trusted else { return }

        trustedTackAngles.append(measured)
        if trustedTackAngles.count > tackAngleWindowSize {
            trustedTackAngles.removeFirst(trustedTackAngles.count - tackAngleWindowSize)
        }

        guard trustedTackAngles.count >= 5 else { return }

        let sorted = trustedTackAngles.sorted()
        let lowerIndex = max(0, Int(Double(sorted.count - 1) * tackAngleLowerPercentile))
        let upperIndex = min(sorted.count - 1, Int(Double(sorted.count - 1) * tackAngleUpperPercentile))

        tackAngleMin = max(45, min(sorted[lowerIndex], sorted[upperIndex] - 10))
        tackAngleMax = min(140, max(sorted[upperIndex], tackAngleMin + 10))
    }

    private func checkSailingTooClose(heading: Double, timestamp: Date) {
        guard let wind = filter.windDegrees else { return }
        let angleToWind = CircularHeading.angleBetween(heading, wind)
        let threshold = (tackAngleMin / 2) - 5
        let tooClose = angleToWind < threshold

        if tooClose {
            if !wasSailingTooClose {
                possibleShift = true
                earlyWarningShiftPending = true
                bigShiftOverrideLegs = 2
            }
            outsideCloseThresholdSince = nil
            wasSailingTooClose = true
            return
        }

        if wasSailingTooClose {
            outsideCloseThresholdSince = timestamp
        }
        wasSailingTooClose = false

        guard earlyWarningShiftPending, let outsideSince = outsideCloseThresholdSince else {
            return
        }
        if timestamp.timeIntervalSince(outsideSince) >= earlyWarningClearSeconds {
            possibleShift = false
            earlyWarningShiftPending = false
            outsideCloseThresholdSince = nil
        }
    }

    private func buildSnapshot() -> WindEstimationSnapshot {
        guard let heading = lastHeading, hasGpsFix, let wind = filter.windDegrees else {
            let message: String
            if settings.baseWindDegrees == nil {
                message = "Set base wind in phone settings"
            } else if !hasGpsFix {
                message = "Waiting for GPS fix…"
            } else {
                message = "Waiting for heading…"
            }
            return WindEstimationSnapshot(
                vmgKnots: nil,
                displayMode: .upwind,
                windDegrees: filter.windDegrees,
                hasWind: filter.windDegrees != nil,
                windAngleDegrees: nil,
                possibleShift: possibleShift,
                statusMessage: message
            )
        }

        let vmg = CircularHeading.vmgKnots(sog: lastSog, heading: heading, windFrom: wind)
        let upwind = CircularHeading.isUpwindHemisphere(heading: heading, windFrom: wind)
        let mode: VmgDisplayMode = upwind ? .upwind : .downwind
        let windAngle = CircularHeading.angleBetween(heading, wind)

        let message: String
        if possibleShift {
            message = "Possible wind shift"
        } else if filter.windDegrees == settings.baseWindDegrees && legAnalyzer.bankedQualifyingLegs < 2 {
            message = "Refining wind…"
        } else {
            message = "Phone VMG"
        }

        return WindEstimationSnapshot(
            vmgKnots: abs(vmg),
            displayMode: mode,
            windDegrees: wind,
            hasWind: true,
            windAngleDegrees: windAngle,
            possibleShift: possibleShift,
            statusMessage: message
        )
    }
}
