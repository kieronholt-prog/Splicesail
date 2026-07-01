import Foundation

enum RaceTimer {
    static func state(
        startGunUTC: Date?,
        countdownDurationSeconds: Int,
        now: Date = Date()
    ) -> RaceTimerState {
        guard let startGunUTC else {
            return .idle
        }

        let delta = Int(floor(now.timeIntervalSince(startGunUTC)))
        if delta < 0 {
            return RaceTimerState(phase: .countdown(secondsRemaining: -delta), startGunUTC: startGunUTC)
        }
        return RaceTimerState(phase: .racing(elapsedSeconds: delta), startGunUTC: startGunUTC)
    }

    static func armCountdown(durationSeconds: Int, now: Date = Date()) -> Date {
        now.addingTimeInterval(TimeInterval(durationSeconds))
    }
}
