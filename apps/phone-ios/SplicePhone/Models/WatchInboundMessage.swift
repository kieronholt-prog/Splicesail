import Foundation

enum WatchMirroredScreen: String, Sendable, Equatable {
    case countdown
    case headingHeel = "heading_heel"
    case trimTurn = "trim_turn"
    case sog
}

struct WatchGpsSample: Sendable, Equatable {
    let sogKnots: Double
    let hasFix: Bool
    let receivedAt: Date
    let cogDegrees: Double?

    init(
        sogKnots: Double,
        hasFix: Bool,
        receivedAt: Date = Date(),
        cogDegrees: Double? = nil
    ) {
        self.sogKnots = sogKnots
        self.hasFix = hasFix
        self.receivedAt = receivedAt
        self.cogDegrees = cogDegrees
    }
}

enum WatchInboundMessage: Sendable, Equatable {
    case startTimer(timestamp: TimeInterval)
    case countdownHalted(remainingSeconds: Int)
    case screenSync(WatchMirroredScreen)
    case activityEnded
    case gpsSample(WatchGpsSample)
    case baseWindSet(degrees: Double)
}
