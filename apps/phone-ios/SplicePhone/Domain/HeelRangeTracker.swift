import Foundation

/// Sliding 5-second heel min/max for the heel bar trail overlay.
@MainActor
final class HeelRangeTracker: ObservableObject {
    private struct Sample {
        let time: Date
        let heel: Double
    }

    private var samples: [Sample] = []
    private let windowSeconds: TimeInterval = 5

    @Published private(set) var minHeel: Double?
    @Published private(set) var maxHeel: Double?

    func record(heelDegrees: Double, now: Date = Date()) {
        let heel = heelDegrees
        samples.append(Sample(time: now, heel: heel))
        prune(olderThan: now.addingTimeInterval(-windowSeconds))

        guard !samples.isEmpty else {
            minHeel = heel
            maxHeel = heel
            return
        }

        minHeel = samples.map(\.heel).min()
        maxHeel = samples.map(\.heel).max()
    }

    func reset() {
        samples.removeAll()
        minHeel = nil
        maxHeel = nil
    }

    private func prune(olderThan cutoff: Date) {
        samples.removeAll { $0.time < cutoff }
    }
}

enum HeelBarLayout {
    static let maxDegrees = 30.0
    static let graduationMarks: [Double] = [0, 5, 10, 15, 20, 25]

    /// Port (+) on the left, starboard (−) on the right.
    static func normalizedPosition(for heelDegrees: Double) -> CGFloat {
        let clamped = min(maxDegrees, max(-maxDegrees, heelDegrees))
        return CGFloat((maxDegrees - clamped) / (maxDegrees * 2))
    }

    /// Black trail on the bar — always surrounds the live bubble (center + width in bar coordinates).
    static func trailSpan(
        heelDegrees: Double,
        minHeel: Double?,
        maxHeel: Double?,
        barWidth: CGFloat,
        minimumWidth: CGFloat
    ) -> (centerX: CGFloat, width: CGFloat) {
        let current = heelDegrees
        let bubbleCenter = normalizedPosition(for: current) * barWidth
        let halfMin = minimumWidth / 2

        let historyMin = minHeel ?? current
        let historyMax = maxHeel ?? current
        let heelMin = min(historyMin, historyMax, current)
        let heelMax = max(historyMin, historyMax, current)

        var rangeLeft = normalizedPosition(for: heelMax) * barWidth
        var rangeRight = normalizedPosition(for: heelMin) * barWidth
        if rangeLeft > rangeRight {
            swap(&rangeLeft, &rangeRight)
        }

        rangeLeft = min(rangeLeft, bubbleCenter - halfMin)
        rangeRight = max(rangeRight, bubbleCenter + halfMin)

        rangeLeft = max(0, rangeLeft)
        rangeRight = min(barWidth, rangeRight)

        let spanWidth = max(minimumWidth, rangeRight - rangeLeft)
        let centerX = min(max((rangeLeft + rangeRight) / 2, halfMin), barWidth - halfMin)
        return (centerX, spanWidth)
    }

    static func graduationPositions() -> [(degrees: Double, position: CGFloat)] {
        var marks: [Double] = []
        for value in graduationMarks where value > 0 {
            marks.append(value)
            marks.append(-value)
        }
        marks.append(0)
        return marks.sorted().map { degree in
            (degree, normalizedPosition(for: degree))
        }
    }
}
