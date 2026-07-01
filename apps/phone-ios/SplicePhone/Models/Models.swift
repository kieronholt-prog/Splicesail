import Foundation

struct AttitudeSample: Equatable, Sendable {
    let headingDegrees: Int?
    let heelDegrees: Int
    let trimDegrees: Int
    let fineHeelDegrees: Double
    let fineTrimDegrees: Double
    let turnDegreesPerSecond: Double
    let publishTimestamp: TimeInterval
    let isLandscapePose: Bool
    let landscapeSide: LandscapeSide?
    let rawYawDegrees: Double
    let rawPitchDegrees: Double
    let rawRollDegrees: Double
    let rawGravityX: Double
    let rawGravityY: Double
    let rawGravityZ: Double

    /// Phone UI (+port, −starboard). Raw `heelDegrees` keeps Garmin bezel sign.
    var displayHeelDegrees: Double { -fineHeelDegrees }
    var displayHeelDegreesInt: Int { -heelDegrees }

    /// Phone UI (+bow up, −bow down). Raw `trimDegrees` matches BLE / watch.
    var displayTrimDegrees: Double { -fineTrimDegrees }
    var displayTrimDegreesInt: Int { -trimDegrees }
}

enum RaceTimerPhase: Equatable, Sendable {
    case idle
    case countdown(secondsRemaining: Int)
    case racing(elapsedSeconds: Int)
}

struct RaceTimerState: Equatable, Sendable {
    let phase: RaceTimerPhase
    let startGunUTC: Date?

    static let idle = RaceTimerState(phase: .idle, startGunUTC: nil)
}

enum WatchMessageEvent: String, Codable, Sendable {
    case screenSync = "screen_sync"
    case startTimer = "start_timer"
}
