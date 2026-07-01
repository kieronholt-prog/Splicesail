import Foundation

enum OnWaterSessionUploadState: String, Codable, Sendable {
    case recording
    case pendingUpload
    case uploaded
}

enum CountdownMode: String, Codable, Sendable {
    case standaloneManual = "standalone_manual"
    case clubSynced = "club_synced"
    case phoneManual = "phone_manual"
}

enum GpsSource: String, Codable, Sendable {
    case pending
    case watchFit = "watch_fit"
    case spliceStrava = "splice_strava"
    case spliceUpload = "splice_upload"
    case phone
}

enum MergeQuality: String, Codable, Sendable {
    case pending
    case confident
    case gpsOnly = "gps_only"
    case manualReview = "manual_review"
}

struct OnWaterSession: Codable, Equatable, Identifiable, Sendable {
    let id: UUID
    var startedAt: Date?
    var endedAt: Date?
    var raceId: String?
    var raceEntryId: String?
    var boatId: String?
    var raceName: String?
    var boatLabel: String?
    var raceStartUtc: String?
    var deviceGunUtc: String?
    var lastSyncedFleetStartUtc: String?
    var countdownMode: CountdownMode
    var gpsSource: GpsSource
    var mergeQuality: MergeQuality
    var startAlignmentWarning: Bool
    var uploadState: OnWaterSessionUploadState
    var submissionId: String?

    static func open() -> OnWaterSession {
        OnWaterSession(
            id: UUID(),
            startedAt: nil,
            endedAt: nil,
            raceId: nil,
            raceEntryId: nil,
            boatId: nil,
            raceName: nil,
            boatLabel: nil,
            raceStartUtc: nil,
            deviceGunUtc: nil,
            lastSyncedFleetStartUtc: nil,
            countdownMode: .clubSynced,
            gpsSource: .pending,
            mergeQuality: .pending,
            startAlignmentWarning: false,
            uploadState: .recording,
            submissionId: nil
        )
    }

    var isLinkedToRace: Bool {
        raceId != nil && raceEntryId != nil && boatId != nil
    }

    enum CodingKeys: String, CodingKey {
        case id, startedAt, endedAt, raceId, raceEntryId, boatId, raceName, boatLabel
        case raceStartUtc, deviceGunUtc, lastSyncedFleetStartUtc, countdownMode
        case gpsSource, mergeQuality, startAlignmentWarning, uploadState, submissionId
    }

    init(
        id: UUID,
        startedAt: Date?,
        endedAt: Date?,
        raceId: String?,
        raceEntryId: String?,
        boatId: String?,
        raceName: String?,
        boatLabel: String?,
        raceStartUtc: String?,
        deviceGunUtc: String?,
        lastSyncedFleetStartUtc: String?,
        countdownMode: CountdownMode,
        gpsSource: GpsSource,
        mergeQuality: MergeQuality,
        startAlignmentWarning: Bool,
        uploadState: OnWaterSessionUploadState,
        submissionId: String? = nil
    ) {
        self.id = id
        self.startedAt = startedAt
        self.endedAt = endedAt
        self.raceId = raceId
        self.raceEntryId = raceEntryId
        self.boatId = boatId
        self.raceName = raceName
        self.boatLabel = boatLabel
        self.raceStartUtc = raceStartUtc
        self.deviceGunUtc = deviceGunUtc
        self.lastSyncedFleetStartUtc = lastSyncedFleetStartUtc
        self.countdownMode = countdownMode
        self.gpsSource = gpsSource
        self.mergeQuality = mergeQuality
        self.startAlignmentWarning = startAlignmentWarning
        self.uploadState = uploadState
        self.submissionId = submissionId
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(UUID.self, forKey: .id)
        startedAt = try c.decodeIfPresent(Date.self, forKey: .startedAt)
        endedAt = try c.decodeIfPresent(Date.self, forKey: .endedAt)
        raceId = try c.decodeIfPresent(String.self, forKey: .raceId)
        raceEntryId = try c.decodeIfPresent(String.self, forKey: .raceEntryId)
        boatId = try c.decodeIfPresent(String.self, forKey: .boatId)
        raceName = try c.decodeIfPresent(String.self, forKey: .raceName)
        boatLabel = try c.decodeIfPresent(String.self, forKey: .boatLabel)
        raceStartUtc = try c.decodeIfPresent(String.self, forKey: .raceStartUtc)
        deviceGunUtc = try c.decodeIfPresent(String.self, forKey: .deviceGunUtc)
        lastSyncedFleetStartUtc = try c.decodeIfPresent(String.self, forKey: .lastSyncedFleetStartUtc)
        countdownMode = try c.decodeIfPresent(CountdownMode.self, forKey: .countdownMode) ?? .clubSynced
        gpsSource = try c.decodeIfPresent(GpsSource.self, forKey: .gpsSource) ?? .pending
        mergeQuality = try c.decodeIfPresent(MergeQuality.self, forKey: .mergeQuality) ?? .pending
        startAlignmentWarning = try c.decodeIfPresent(Bool.self, forKey: .startAlignmentWarning) ?? false
        uploadState = try c.decode(OnWaterSessionUploadState.self, forKey: .uploadState)
        submissionId = try c.decodeIfPresent(String.self, forKey: .submissionId)
    }

    var raceStartDate: Date? {
        guard let raceStartUtc else { return nil }
        return OnWaterSession.parseUtcIso(raceStartUtc)
    }

    static func parseUtcIso(_ iso: String) -> Date? {
        let trimmed = iso.trimmingCharacters(in: .whitespacesAndNewlines)
        let withFractional = ISO8601DateFormatter()
        withFractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = withFractional.date(from: trimmed) { return date }
        let standard = ISO8601DateFormatter()
        standard.formatOptions = [.withInternetDateTime]
        return standard.date(from: trimmed)
    }
}

struct ActivityEndPrompt: Identifiable, Equatable {
    let sessionId: UUID
    let raceName: String?
    let boatLabel: String?
    let boatId: String?
    let groupId: String?
    let seriesId: String?
    let raceId: String?

    var id: UUID { sessionId }
}
