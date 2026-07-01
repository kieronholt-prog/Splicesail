import Foundation

@MainActor
final class SessionRecordingService: ObservableObject {
    @Published private(set) var activeSession: OnWaterSession?
    @Published var activityEndPrompt: ActivityEndPrompt?

    private let store: OnWaterSessionStore
    private let attitudeRecorder = SessionAttitudeRecorder()
    private var trackUpload: TrackUploadService?

    private static let startAlignmentThresholdSeconds: TimeInterval = 15

    init(store: OnWaterSessionStore = .shared, trackUpload: TrackUploadService? = nil) {
        self.store = store
        self.trackUpload = trackUpload
        if let loaded = store.load() {
            activeSession = loaded
            if loaded.endedAt == nil {
                attitudeRecorder.begin(sessionId: loaded.id, raceEntryId: loaded.raceEntryId)
            }
        }
    }

    var isLoggingAttitude: Bool {
        guard let session = activeSession else { return false }
        return session.endedAt == nil
    }

    func bindRace(_ context: TallyLinkContext) {
        var session = activeSession ?? OnWaterSession.open()
        session.raceId = context.raceId
        session.raceEntryId = context.raceEntryId
        session.boatId = context.boatId
        session.raceName = context.raceName
        session.boatLabel = context.boatLabel
        session.raceStartUtc = context.fleetStartUtc
        session.uploadState = .recording
        session.countdownMode = .clubSynced
        attitudeRecorder.begin(sessionId: session.id, raceEntryId: session.raceEntryId)
        persist(session)
    }

    func markClubSync(fleetStartUtc: String) {
        guard var session = activeSession, session.endedAt == nil else { return }
        session.lastSyncedFleetStartUtc = fleetStartUtc
        session.raceStartUtc = fleetStartUtc
        if session.countdownMode != .standaloneManual {
            session.countdownMode = .clubSynced
        }
        persist(session)
    }

    func clearRaceLink() {
        guard var session = activeSession, session.endedAt == nil else { return }
        session.raceId = nil
        session.raceEntryId = nil
        session.boatId = nil
        session.raceName = nil
        session.boatLabel = nil
        session.raceStartUtc = nil
        session.lastSyncedFleetStartUtc = nil
        session.countdownMode = .standaloneManual
        persist(session)
    }

    func noteDeviceGun(_ gunTime: Date) {
        guard var session = activeSession, session.endedAt == nil else { return }
        let iso = Self.utcIsoString(gunTime)
        session.deviceGunUtc = iso
        if session.startedAt == nil {
            session.startedAt = gunTime
        }
        if let raceStart = session.raceStartDate {
            session.startAlignmentWarning =
                abs(gunTime.timeIntervalSince1970 - raceStart.timeIntervalSince1970)
                > Self.startAlignmentThresholdSeconds
        }
        attitudeRecorder.logEvent(type: "device_gun", at: gunTime)
        persist(session)
    }

    func ingestAttitude(_ sample: AttitudeSample, windDegrees: Double?) {
        guard isLoggingAttitude else { return }
        attitudeRecorder.ingest(sample, windDegrees: windDegrees)
    }

    func endSession(at endedAt: Date = Date(), showActivityEndPrompt: Bool = false) {
        guard var session = activeSession, session.endedAt == nil else { return }
        session.endedAt = endedAt
        session.uploadState = .pendingUpload
        attitudeRecorder.logEvent(type: "activity_end", at: endedAt)
        attitudeRecorder.finish()
        persist(session)

        if showActivityEndPrompt {
            activityEndPrompt = ActivityEndPrompt(
                sessionId: session.id,
                raceName: session.raceName,
                boatLabel: session.boatLabel,
                boatId: session.boatId,
                groupId: nil,
                seriesId: nil,
                raceId: session.raceId
            )
        }

        if let trackUpload {
            let snapshot = session
            Task { await trackUpload.uploadPendingSessionIfNeeded(snapshot) }
        }
    }

    func dismissActivityEndPrompt() {
        activityEndPrompt = nil
    }

    func enrichActivityEndPrompt(race: NextRacePayload) {
        guard let prompt = activityEndPrompt else { return }
        activityEndPrompt = ActivityEndPrompt(
            sessionId: prompt.sessionId,
            raceName: prompt.raceName ?? race.raceName,
            boatLabel: prompt.boatLabel,
            boatId: prompt.boatId,
            groupId: race.groupId,
            seriesId: race.seriesId,
            raceId: race.raceId
        )
    }

    func markSessionUploaded(submissionId: String, sessionId: UUID) {
        guard var session = activeSession, session.id == sessionId else { return }
        session.uploadState = .uploaded
        session.submissionId = submissionId
        persist(session)
    }

    func clearCompletedSession() {
        guard let session = activeSession, session.endedAt != nil else { return }
        activeSession = nil
        store.save(nil)
        activityEndPrompt = nil
    }

    private func persist(_ session: OnWaterSession) {
        activeSession = session
        store.save(session)
    }

    private static func utcIsoString(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }
}
