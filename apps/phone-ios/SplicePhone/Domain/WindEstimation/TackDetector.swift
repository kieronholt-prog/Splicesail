import Foundation

/// Tack/gybe detection from turn rate + heading + heel (not COG).
struct TackDetector {
    private enum Phase {
        case steady
        case turning
    }

    private var phase: Phase = .steady
    private var turnEndSamples = 0
    private var lastTackHeading: Double?
    private var pendingTackHeading: Double?

    private let turnStartThreshold = 6.0
    private let turnEndThreshold = 2.5
    private let turnEndSamplesRequired = 2
    private let minHeadingChange = 30.0

    mutating func reset() {
        phase = .steady
        turnEndSamples = 0
        lastTackHeading = nil
        pendingTackHeading = nil
    }

    /// Returns completed tack exit heading when a tack/gybe finishes.
    mutating func ingest(heading: Double, turnRate: Double, heel: Double) -> Double? {
        let absTurn = abs(turnRate)

        switch phase {
        case .steady:
            if absTurn >= turnStartThreshold {
                phase = .turning
                turnEndSamples = 0
                pendingTackHeading = heading
            }
            return nil

        case .turning:
            pendingTackHeading = heading
            if absTurn < turnEndThreshold {
                turnEndSamples += 1
            } else {
                turnEndSamples = 0
            }

            guard turnEndSamples >= turnEndSamplesRequired,
                  let exitHeading = pendingTackHeading else {
                return nil
            }

            if let previous = lastTackHeading,
               CircularHeading.angleBetween(previous, exitHeading) < minHeadingChange {
                phase = .steady
                turnEndSamples = 0
                pendingTackHeading = nil
                return nil
            }

            lastTackHeading = exitHeading
            phase = .steady
            turnEndSamples = 0
            pendingTackHeading = nil
            return exitHeading
        }
    }
}
