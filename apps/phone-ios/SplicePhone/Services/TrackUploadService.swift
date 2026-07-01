import Foundation

@MainActor
final class TrackUploadService {
    private let api: SpliceAPIClient
    private let store: OnWaterSessionStore
    private weak var sessionRecording: SessionRecordingService?

    init(
        auth: SpliceAuthConnectable,
        store: OnWaterSessionStore = .shared,
        sessionRecording: SessionRecordingService? = nil
    ) {
        api = SpliceAPIClient(auth: auth)
        self.store = store
        self.sessionRecording = sessionRecording
    }

    func attach(sessionRecording: SessionRecordingService) {
        self.sessionRecording = sessionRecording
    }

    /// Register ended session metadata with Splice (draft submission; FIT upload is a later step).
    func uploadPendingSessionIfNeeded(_ session: OnWaterSession) async {
        guard session.uploadState == .pendingUpload,
              let raceEntryId = session.raceEntryId,
              let startedAt = session.startedAt,
              let endedAt = session.endedAt else { return }

        let nameParts = [session.raceName, session.boatLabel].compactMap { $0?.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        let activityName = nameParts.isEmpty ? nil : nameParts.joined(separator: " · ")

        do {
            let submissionId = try await api.registerTrackSession(
                raceEntryId: raceEntryId,
                activityStartedAt: startedAt,
                activityEndedAt: endedAt,
                activityName: activityName,
                localSessionId: session.id.uuidString
            )
            var updated = session
            updated.uploadState = .uploaded
            updated.submissionId = submissionId
            store.save(updated)
            sessionRecording?.markSessionUploaded(submissionId: submissionId, sessionId: session.id)
        } catch {
            SpliceAPIDiagnostic.record("Track register failed — \(error.localizedDescription)")
        }
    }
}
