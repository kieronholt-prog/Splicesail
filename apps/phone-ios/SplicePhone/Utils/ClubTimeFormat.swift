import Foundation

enum ClubTimeFormat {
  static func hm(iso: String, timeZoneId: String) -> String? {
    guard let date = iso8601Date(iso) else { return nil }
    return format(date: date, timeZoneId: timeZoneId, includeSeconds: false)
  }

  static func fleetStartHm(scheduledAt: String, offsetMinutes: Int, timeZoneId: String) -> String? {
    guard let base = iso8601Date(scheduledAt) else { return nil }
    let start = base.addingTimeInterval(TimeInterval(offsetMinutes * 60))
    return format(date: start, timeZoneId: timeZoneId, includeSeconds: false)
  }

  /// ISO UTC for fleet start when the API omits `fleetStartUtc` (older mobile API).
    static func fleetStartUtcIso(scheduledAt: String, offsetMinutes: Int) -> String? {
        guard let base = iso8601Date(scheduledAt) else { return nil }
        let start = base.addingTimeInterval(TimeInterval(offsetMinutes * 60))
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: start)
    }

    /// Calendar day for activity or race timestamps (device locale).
    static func activityDayLabel(iso: String) -> String? {
        guard let date = iso8601Date(iso) else { return nil }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_GB")
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        return formatter.string(from: date)
    }

    private static func iso8601Date(_ iso: String) -> Date? {
    let trimmed = iso.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return nil }

    let withFractional = ISO8601DateFormatter()
    withFractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = withFractional.date(from: trimmed) { return date }

    let standard = ISO8601DateFormatter()
    standard.formatOptions = [.withInternetDateTime]
    return standard.date(from: trimmed)
  }

  private static func format(date: Date, timeZoneId: String, includeSeconds: Bool) -> String? {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_GB")
    formatter.timeZone = TimeZone(identifier: timeZoneId) ?? TimeZone(identifier: "UTC")
    formatter.dateFormat = includeSeconds ? "HH:mm:ss" : "HH:mm"
    return formatter.string(from: date)
  }
}
