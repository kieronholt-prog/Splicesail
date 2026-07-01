import Foundation

@MainActor
final class RaceTimerViewModel: ObservableObject {
    @Published private(set) var timerState: RaceTimerState = .idle
    @Published var countdownMinutes: Int = 5
    @Published private(set) var haltedRemainingSeconds: Int?
    @Published private(set) var syncMessage: String?
    @Published private(set) var startPostponed = false

    private let garminService: GarminCIQConnectable
    private var tickTask: Task<Void, Never>?

    init(garminService: GarminCIQConnectable) {
        self.garminService = garminService
        tickTask = Task { await tick() }
    }

    deinit {
        tickTask?.cancel()
    }

    var isCountdownActive: Bool {
        switch timerState.phase {
        case .countdown, .racing:
            return true
        case .idle:
            return false
        }
    }

    func armCountdownFromPhone() {
        let gun = RaceTimer.armCountdown(durationSeconds: countdownMinutes * 60)
        applyGunTime(gun)
        syncMessage = nil
        Task {
            await garminService.sendCountdownSync(gunUnix: gun.timeIntervalSince1970)
        }
    }

    func applyClubGunTime(_ gun: Date) {
        startPostponed = false
        applyGunTime(gun)
        syncMessage = nil
    }

    func applyStartPostponed() {
        startPostponed = true
        timerState = .idle
        syncMessage = nil
    }

    func clearStartPostponed() {
        startPostponed = false
    }

    func resetTimer() {
        startPostponed = false
        let remainingSeconds = haltedRemainingSeconds ?? countdownMinutes * 60
        timerState = .idle
        syncMessage = nil
        Task {
            await garminService.sendCountdownHalt(remainingSeconds: remainingSeconds)
        }
    }

    func applyWatchStart(at unixTimestamp: TimeInterval) async {
        let gun = Date(timeIntervalSince1970: unixTimestamp)
        applyGunTime(gun)
        do {
            try await garminService.acknowledgeStartTimer()
            syncMessage = nil
        } catch {
            syncMessage = "Could not confirm start timer with your watch. Check Garmin Connect is open."
        }
    }

    func applyWatchCountdownHalted(remainingSeconds: Int) {
        haltedRemainingSeconds = remainingSeconds > 0 ? remainingSeconds : nil
        if remainingSeconds > 0 {
            countdownMinutes = min(30, max(1, (remainingSeconds + 59) / 60))
        }
        timerState = .idle
        syncMessage = nil
    }

    func applyWatchActivityEnded() {
        haltedRemainingSeconds = nil
        timerState = .idle
        syncMessage = nil
    }

    private func applyGunTime(_ gun: Date) {
        haltedRemainingSeconds = nil
        let remaining = max(0, Int(floor(gun.timeIntervalSinceNow)))
        if remaining > 0 {
            countdownMinutes = min(30, max(1, (remaining + 59) / 60))
        }
        timerState = RaceTimer.state(
            startGunUTC: gun,
            countdownDurationSeconds: countdownMinutes * 60
        )
    }

    private func tick() async {
        while !Task.isCancelled {
            try? await Task.sleep(for: .milliseconds(250))
            guard let gun = timerState.startGunUTC else {
                continue
            }
            timerState = RaceTimer.state(
                startGunUTC: gun,
                countdownDurationSeconds: countdownMinutes * 60
            )
        }
    }
}
