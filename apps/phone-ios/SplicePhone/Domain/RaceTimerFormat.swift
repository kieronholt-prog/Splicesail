import Foundation

/// Display formatting aligned with the Splice watch countdown screen.
enum RaceTimerFormat {
    static func header(for phase: RaceTimerPhase) -> String {
        switch phase {
        case .countdown:
            return "COUNTDOWN"
        case .racing:
            return "ELAPSED"
        case .idle:
            return "COUNTDOWN"
        }
    }

    static func line(phase: RaceTimerPhase, presetMinutes: Int, haltedRemainingSeconds: Int? = nil) -> String {
        switch phase {
        case .idle:
            if let haltedRemainingSeconds, haltedRemainingSeconds > 0 {
                return formatSeconds(haltedRemainingSeconds)
            }
            let presetSeconds = presetMinutes * 60
            if presetSeconds < 60 {
                return "\(presetSeconds)"
            }
            return "\(presetMinutes):00"
        case let .countdown(secondsRemaining):
            return formatSeconds(secondsRemaining)
        case let .racing(elapsedSeconds):
            return formatSeconds(elapsedSeconds)
        }
    }

    private static func formatSeconds(_ seconds: Int) -> String {
        if seconds < 60 {
            return "\(seconds)"
        }
        let minutes = seconds / 60
        let remainder = seconds % 60
        return String(format: "%d:%02d", minutes, remainder)
    }
}
