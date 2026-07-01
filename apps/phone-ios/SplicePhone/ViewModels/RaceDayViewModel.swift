import Foundation

@MainActor
final class RaceDayViewModel: ObservableObject {
    @Published private(set) var isSignedIn = false
    @Published private(set) var userEmail = ""
    @Published private(set) var isConfigured = SpliceConfig.isConfigured
    @Published private(set) var isLoading = false
    @Published private(set) var nextRace: NextRacePayload?
    @Published private(set) var clubSyncStatus: String?
    @Published private(set) var apiDiagnostic: String = SpliceAPIDiagnostic.lastLine
    @Published var errorMessage: String?
    @Published var signInEmail = ""
    @Published var signInPassword = ""

    private let auth: SpliceAuthConnectable
    private let api: SpliceAPIClient
    private let sessionRecording: SessionRecordingService
    private let garmin: GarminCIQConnectable
    private let raceTimerViewModel: RaceTimerViewModel

    /// Shared auth handle for child views (analysis detail, fleet compare).
    var spliceAuth: SpliceAuthConnectable { auth }

    init(
        auth: SpliceAuthConnectable,
        garmin: GarminCIQConnectable,
        sessionRecording: SessionRecordingService,
        raceTimerViewModel: RaceTimerViewModel
    ) {
        self.auth = auth
        self.garmin = garmin
        self.raceTimerViewModel = raceTimerViewModel
        self.api = SpliceAPIClient(auth: auth)
        self.sessionRecording = sessionRecording
        SpliceAPIDiagnostic.onUpdate = { [weak self] line in
            self?.apiDiagnostic = line
        }
    }

    func isSessionLinked(to boat: TallyBoatRow) -> Bool {
        guard let session = sessionRecording.activeSession, session.endedAt == nil else { return false }
        return session.boatId == boat.boatId
    }

    func bootstrap() async {
        isConfigured = SpliceConfig.isConfigured
        apiDiagnostic = SpliceConfig.apiBaseURL?.absoluteString ?? "API URL not set"
        await auth.restoreSession()
        syncAuthState()
        if isSignedIn {
            await refresh(showLoading: true)
            await syncClubCountdownIfNeeded()
        }
    }

    func runRaceTabPolling() async {
        while !Task.isCancelled {
            let interval = pollIntervalSeconds()
            try? await Task.sleep(for: .seconds(interval))
            guard !Task.isCancelled, isSignedIn else { continue }
            await refresh(showLoading: false)
            await syncClubCountdownIfNeeded()
        }
    }

    /// Poll next-race + club countdown while signed in (all tabs / landscape).
    func runBackgroundRaceSync() async {
        await runRaceTabPolling()
    }

    func signIn() async {
        errorMessage = nil
        isLoading = true
        defer { isLoading = false }
        do {
            try await auth.signIn(email: signInEmail.trimmingCharacters(in: .whitespaces), password: signInPassword)
            syncAuthState()
            await refresh(showLoading: true)
            await syncClubCountdownIfNeeded()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func signOut() async {
        errorMessage = nil
        do {
            try await auth.signOut()
            syncAuthState()
            nextRace = nil
            clubSyncStatus = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func refresh(showLoading: Bool = true) async {
        guard isSignedIn else { return }
        if showLoading {
            isLoading = true
        }
        errorMessage = nil
        defer {
            if showLoading {
                isLoading = false
            }
        }
        do {
            nextRace = try await api.fetchNextRace()
            if let race = nextRace {
                sessionRecording.enrichActivityEndPrompt(race: race)
            }
            updateClubSyncStatusFromRace()
            await syncClubCountdownIfNeeded()
        } catch let error as SpliceAuthError {
            if error == .sessionExpired {
                syncAuthState()
            }
            errorMessage = error.localizedDescription
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func tallyAfloat(boat: TallyBoatRow) async {
        guard nextRace != nil else { return }
        await performTally(boat: boat, action: .afloat, outcome: nil)
        await syncClubCountdownIfNeeded()
    }

    func undoTallyAfloat(boat: TallyBoatRow) async {
        guard nextRace != nil else { return }
        await performTally(boat: boat, action: .undoAfloat, outcome: nil)
        raceTimerViewModel.resetTimer()
        clubSyncStatus = nil
    }

    func tallyAshore(boat: TallyBoatRow, outcome: String) async {
        guard nextRace != nil else { return }
        await performTally(boat: boat, action: .ashore, outcome: outcome)
    }

    func syncClubCountdownIfNeeded() async {
        guard let race = nextRace else {
            clubSyncStatus = nil
            return
        }

        if let session = sessionRecording.activeSession,
           session.isLinkedToRace,
           session.endedAt == nil,
           session.countdownMode != .standaloneManual,
           let boatId = session.boatId,
           let boat = race.boats.first(where: { $0.boatId == boatId }),
           boat.tallyAfloatAt != nil {
            if boat.fleetStartPostponed {
                if !raceTimerViewModel.startPostponed {
                    let remaining = countdownRemainingSeconds()
                    raceTimerViewModel.applyStartPostponed()
                    _ = await garmin.sendCountdownHalt(remainingSeconds: remaining)
                }
                clubSyncStatus = "Start postponed — AP"
                return
            }

            if raceTimerViewModel.startPostponed {
                raceTimerViewModel.clearStartPostponed()
            }

            guard let gunDate = OnWaterSession.parseUtcIso(
                boat.resolvedFleetStartUtc(scheduledAt: race.scheduledAt)
            ) else {
                clubSyncStatus = nil
                return
            }

            raceTimerViewModel.applyClubGunTime(gunDate)

            let fleetStartIso = boat.resolvedFleetStartUtc(scheduledAt: race.scheduledAt)
            let gunUnix = gunDate.timeIntervalSince1970
            let lastSyncedUnix = session.lastSyncedFleetStartUtc
                .flatMap { OnWaterSession.parseUtcIso($0) }?
                .timeIntervalSince1970
            let needsWatchSync = lastSyncedUnix == nil || abs(lastSyncedUnix! - gunUnix) > 0.5

            if needsWatchSync {
                let sentToWatch = await garmin.sendCountdownSync(gunUnix: gunUnix)
                sessionRecording.markClubSync(fleetStartUtc: fleetStartIso)
                if boat.fleetStartSource == "start_signal_at" {
                    clubSyncStatus = sentToWatch
                        ? "Countdown synced to RO start signal"
                        : "Phone countdown set — pair your watch in Setup to sync"
                } else {
                    clubSyncStatus = sentToWatch
                        ? "Countdown synced to scheduled fleet start"
                        : "Phone countdown set — pair your watch in Setup to sync"
                }
            } else {
                clubSyncStatus = boat.fleetStartSource == "start_signal_at"
                    ? "Countdown synced to RO start signal"
                    : "Countdown synced to scheduled fleet start"
            }
            return
        }

        updateClubSyncStatusFromRace()
    }

    private func updateClubSyncStatusFromRace() {
        guard let race = nextRace else {
            clubSyncStatus = nil
            return
        }
        if let boatId = sessionRecording.activeSession?.boatId,
           let boat = race.boats.first(where: { $0.boatId == boatId }),
           boat.fleetStartPostponed {
            clubSyncStatus = "Start postponed — AP"
            return
        }
        if race.boats.contains(where: \.fleetStartPostponed) {
            clubSyncStatus = "Start postponed — AP (tally afloat to sync countdown)"
            return
        }
        if let boatId = sessionRecording.activeSession?.boatId,
           race.boats.first(where: { $0.boatId == boatId })?.tallyAfloatAt == nil {
            clubSyncStatus = "Tally afloat to arm club countdown"
            return
        }
        if clubSyncStatus?.contains("postponed") == true {
            clubSyncStatus = nil
        }
    }

    private func pollIntervalSeconds() -> TimeInterval {
        if let session = sessionRecording.activeSession,
           session.isLinkedToRace,
           session.endedAt == nil {
            return RaceStartPollWindow.linkedIntervalSeconds
        }
        guard let race = nextRace else { return RaceStartPollWindow.slowIntervalSeconds }
        let starts = race.boats.map { $0.resolvedFleetStartUtc(scheduledAt: race.scheduledAt) }
        return RaceStartPollWindow.pollIntervalSeconds(fleetStartUtcValues: starts)
    }

    private func performTally(boat: TallyBoatRow, action: TallyAction, outcome: String?) async {
        guard let race = nextRace else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            switch action {
            case .afloat:
                let raceEntryId = try await api.tallyAfloat(
                    groupId: race.groupId,
                    seriesId: race.seriesId,
                    raceId: race.raceId,
                    boatId: boat.boatId
                )
                sessionRecording.bindRace(
                    TallyLinkContext(
                        raceId: race.raceId,
                        raceEntryId: raceEntryId,
                        boatId: boat.boatId,
                        raceName: race.raceName,
                        boatLabel: boat.displayName,
                        fleetStartUtc: boat.resolvedFleetStartUtc(scheduledAt: race.scheduledAt)
                    )
                )
            case .undoAfloat:
                try await api.undoTallyAfloat(
                    groupId: race.groupId,
                    seriesId: race.seriesId,
                    raceId: race.raceId,
                    boatId: boat.boatId
                )
                if sessionRecording.activeSession?.boatId == boat.boatId {
                    sessionRecording.clearRaceLink()
                }
            case .ashore:
                guard let outcome else { return }
                let raceEntryId = try await api.tallyAshore(
                    groupId: race.groupId,
                    seriesId: race.seriesId,
                    raceId: race.raceId,
                    boatId: boat.boatId,
                    outcome: outcome
                )
                _ = raceEntryId
                sessionRecording.dismissActivityEndPrompt()
            }
            await refresh(showLoading: false)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func syncAuthState() {
        isSignedIn = auth.currentUser != nil
        userEmail = auth.currentUser?.email ?? ""
    }

    private func countdownRemainingSeconds() -> Int {
        switch raceTimerViewModel.timerState.phase {
        case let .countdown(secondsRemaining):
            return max(0, secondsRemaining)
        case .racing, .idle:
            return max(0, raceTimerViewModel.countdownMinutes * 60)
        }
    }
}
