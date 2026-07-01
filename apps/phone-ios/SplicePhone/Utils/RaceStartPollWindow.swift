import Foundation

enum RaceStartPollWindow {
    static let marginSeconds: TimeInterval = 10 * 60
    static let fastIntervalSeconds: TimeInterval = 10
    static let slowIntervalSeconds: TimeInterval = 60
    /// After tally afloat — pick up RO start amendments within a few seconds.
    static let linkedIntervalSeconds: TimeInterval = 5

    static func pollIntervalSeconds(fleetStartUtcValues: [String], now: Date = Date()) -> TimeInterval {
        let nowSec = now.timeIntervalSince1970
        for iso in fleetStartUtcValues {
            guard let start = OnWaterSession.parseUtcIso(iso) else { continue }
            if abs(start.timeIntervalSince1970 - nowSec) <= marginSeconds {
                return fastIntervalSeconds
            }
        }
        return slowIntervalSeconds
    }

    static func isWithinStartWindow(fleetStartUtc: String, now: Date = Date()) -> Bool {
        guard let start = OnWaterSession.parseUtcIso(fleetStartUtc) else { return false }
        return abs(start.timeIntervalSince1970 - now.timeIntervalSince1970) <= marginSeconds
    }
}
