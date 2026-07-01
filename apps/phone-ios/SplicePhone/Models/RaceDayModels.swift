import Foundation

struct NextRacePayload: Codable, Equatable, Sendable {
    let groupId: String
    let seriesId: String
    let raceId: String
    let raceName: String
    let seriesName: String
    let clubName: String
    let scheduledAt: String
    let clubTimeZone: String
    let boats: [TallyBoatRow]

    init(
        groupId: String,
        seriesId: String,
        raceId: String,
        raceName: String,
        seriesName: String,
        clubName: String,
        scheduledAt: String,
        clubTimeZone: String,
        boats: [TallyBoatRow]
    ) {
        self.groupId = groupId
        self.seriesId = seriesId
        self.raceId = raceId
        self.raceName = raceName
        self.seriesName = seriesName
        self.clubName = clubName
        self.scheduledAt = scheduledAt
        self.clubTimeZone = clubTimeZone
        self.boats = boats
    }

    enum CodingKeys: String, CodingKey {
        case groupId, seriesId, raceId, raceName, seriesName, clubName, scheduledAt, clubTimeZone, boats
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        groupId = try container.decodeIfPresent(String.self, forKey: .groupId) ?? ""
        seriesId = try container.decodeIfPresent(String.self, forKey: .seriesId) ?? ""
        raceId = try container.decodeIfPresent(String.self, forKey: .raceId) ?? ""
        raceName = try container.decodeIfPresent(String.self, forKey: .raceName) ?? "Race"
        seriesName = try container.decodeIfPresent(String.self, forKey: .seriesName) ?? "Series"
        clubName = try container.decodeIfPresent(String.self, forKey: .clubName) ?? "Club"
        scheduledAt = try container.decodeIfPresent(String.self, forKey: .scheduledAt) ?? ""
        clubTimeZone = try container.decodeIfPresent(String.self, forKey: .clubTimeZone) ?? "Europe/London"
        boats = try container.decodeIfPresent([TallyBoatRow].self, forKey: .boats) ?? []
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(groupId, forKey: .groupId)
        try container.encode(seriesId, forKey: .seriesId)
        try container.encode(raceId, forKey: .raceId)
        try container.encode(raceName, forKey: .raceName)
        try container.encode(seriesName, forKey: .seriesName)
        try container.encode(clubName, forKey: .clubName)
        try container.encode(scheduledAt, forKey: .scheduledAt)
        try container.encode(clubTimeZone, forKey: .clubTimeZone)
        try container.encode(boats, forKey: .boats)
    }
}

struct TallyBoatRow: Codable, Equatable, Identifiable, Sendable {
    let boatId: String
    let label: String?
    let sailNumber: String
    let classDisplay: String
    let raceEntryId: String?
    let tallyAfloatAt: String?
    let tallyAshoreAt: String?
    let outcome: String?
    let fleetOffsetMinutes: Int
    let fleetStartDisplay: String
    let fleetStartUtc: String
    let fleetStartSource: String
    let canTallyAfloat: Bool
    let canTallyAshore: Bool
    let canUndoTallyAfloat: Bool
    let fleetStartPostponed: Bool

    init(
        boatId: String,
        label: String?,
        sailNumber: String,
        classDisplay: String,
        raceEntryId: String?,
        tallyAfloatAt: String?,
        tallyAshoreAt: String?,
        outcome: String?,
        fleetOffsetMinutes: Int,
        fleetStartDisplay: String,
        fleetStartUtc: String,
        fleetStartSource: String,
        canTallyAfloat: Bool,
        canTallyAshore: Bool,
        canUndoTallyAfloat: Bool,
        fleetStartPostponed: Bool = false
    ) {
        self.boatId = boatId
        self.label = label
        self.sailNumber = sailNumber
        self.classDisplay = classDisplay
        self.raceEntryId = raceEntryId
        self.tallyAfloatAt = tallyAfloatAt
        self.tallyAshoreAt = tallyAshoreAt
        self.outcome = outcome
        self.fleetOffsetMinutes = fleetOffsetMinutes
        self.fleetStartDisplay = fleetStartDisplay
        self.fleetStartUtc = fleetStartUtc
        self.fleetStartSource = fleetStartSource
        self.canTallyAfloat = canTallyAfloat
        self.canTallyAshore = canTallyAshore
        self.canUndoTallyAfloat = canUndoTallyAfloat
        self.fleetStartPostponed = fleetStartPostponed
    }

    var id: String { boatId }

    var displayName: String {
        let hull = label?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let hull, !hull.isEmpty {
            return "\(hull) · #\(sailNumber)"
        }
        return "#\(sailNumber) · \(classDisplay)"
    }

    /// Prefer API `fleetStartUtc`; fall back to schedule + offset for older API responses.
    func resolvedFleetStartUtc(scheduledAt: String) -> String {
        if !fleetStartUtc.isEmpty {
            return fleetStartUtc
        }
        return ClubTimeFormat.fleetStartUtcIso(scheduledAt: scheduledAt, offsetMinutes: fleetOffsetMinutes)
            ?? fleetStartUtc
    }

    enum CodingKeys: String, CodingKey {
        case boatId
        case label
        case sailNumber
        case classDisplay
        case raceEntryId
        case tallyAfloatAt
        case tallyAshoreAt
        case outcome
        case fleetOffsetMinutes
        case fleetStartDisplay
        case fleetStartUtc
        case fleetStartSource
        case canTallyAfloat
        case canTallyAshore
        case canUndoTallyAfloat
        case fleetStartPostponed
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        boatId = try container.decodeIfPresent(String.self, forKey: .boatId) ?? ""
        label = try container.decodeIfPresent(String.self, forKey: .label)
        sailNumber = try container.decodeIfPresent(String.self, forKey: .sailNumber) ?? "—"
        classDisplay = try container.decodeIfPresent(String.self, forKey: .classDisplay) ?? "—"
        raceEntryId = try container.decodeIfPresent(String.self, forKey: .raceEntryId)
        tallyAfloatAt = try container.decodeIfPresent(String.self, forKey: .tallyAfloatAt)
        tallyAshoreAt = try container.decodeIfPresent(String.self, forKey: .tallyAshoreAt)
        outcome = try container.decodeIfPresent(String.self, forKey: .outcome)
        fleetOffsetMinutes = Self.decodeInt(from: container, forKey: .fleetOffsetMinutes) ?? 0
        fleetStartDisplay = try container.decodeIfPresent(String.self, forKey: .fleetStartDisplay) ?? "—"
        fleetStartUtc = try container.decodeIfPresent(String.self, forKey: .fleetStartUtc) ?? ""
        fleetStartSource = try container.decodeIfPresent(String.self, forKey: .fleetStartSource) ?? "scheduled_offset"
        canTallyAfloat = try container.decodeIfPresent(Bool.self, forKey: .canTallyAfloat) ?? false
        canTallyAshore = try container.decodeIfPresent(Bool.self, forKey: .canTallyAshore) ?? false
        let undoFromAPI = try container.decodeIfPresent(Bool.self, forKey: .canUndoTallyAfloat)
        canUndoTallyAfloat = undoFromAPI ?? (tallyAfloatAt != nil && tallyAshoreAt == nil && !canTallyAshore)
        fleetStartPostponed = try container.decodeIfPresent(Bool.self, forKey: .fleetStartPostponed) ?? false
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(boatId, forKey: .boatId)
        try container.encodeIfPresent(label, forKey: .label)
        try container.encode(sailNumber, forKey: .sailNumber)
        try container.encode(classDisplay, forKey: .classDisplay)
        try container.encodeIfPresent(raceEntryId, forKey: .raceEntryId)
        try container.encodeIfPresent(tallyAfloatAt, forKey: .tallyAfloatAt)
        try container.encodeIfPresent(tallyAshoreAt, forKey: .tallyAshoreAt)
        try container.encodeIfPresent(outcome, forKey: .outcome)
        try container.encode(fleetOffsetMinutes, forKey: .fleetOffsetMinutes)
        try container.encode(fleetStartDisplay, forKey: .fleetStartDisplay)
        try container.encode(fleetStartUtc, forKey: .fleetStartUtc)
        try container.encode(fleetStartSource, forKey: .fleetStartSource)
        try container.encode(canTallyAfloat, forKey: .canTallyAfloat)
        try container.encode(canTallyAshore, forKey: .canTallyAshore)
        try container.encode(canUndoTallyAfloat, forKey: .canUndoTallyAfloat)
        try container.encode(fleetStartPostponed, forKey: .fleetStartPostponed)
    }

    private static func decodeInt<K: CodingKey>(
        from container: KeyedDecodingContainer<K>,
        forKey key: K
    ) -> Int? {
        if let value = try? container.decodeIfPresent(Int.self, forKey: key) {
            return value
        }
        if let value = try? container.decodeIfPresent(Double.self, forKey: key) {
            return Int(value.rounded())
        }
        if let text = try? container.decodeIfPresent(String.self, forKey: key),
           let value = Int(text) {
            return value
        }
        return nil
    }
}

enum TallyAction: String, Sendable {
    case afloat
    case ashore
    case undoAfloat
}

struct TallyLinkContext: Equatable, Sendable {
    let raceId: String
    let raceEntryId: String
    let boatId: String
    let raceName: String
    let boatLabel: String
    let fleetStartUtc: String
}
