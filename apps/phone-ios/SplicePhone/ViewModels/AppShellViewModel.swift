import Combine
import Foundation

@MainActor
final class AppShellViewModel: ObservableObject {
    @Published private(set) var userLandscapeScreen: LandscapeScreen = .headingHeel
    @Published private(set) var gpsSample: WatchGpsSample?

    let windEstimationViewModel = WindEstimationViewModel()

    private var watchMessageTask: Task<Void, Never>?
    private weak var displaySettingsViewModel: DisplaySettingsViewModel?
    private weak var sessionRecordingService: SessionRecordingService?
    private var phoneNavigationOverride = false
    private var lastWatchSyncedScreen: LandscapeScreen?

    func start(
        garminService: GarminCIQConnectable,
        raceTimerViewModel: RaceTimerViewModel,
        displaySettingsViewModel: DisplaySettingsViewModel,
        attitudeViewModel: AttitudeViewModel,
        sessionRecordingService: SessionRecordingService
    ) {
        self.sessionRecordingService = sessionRecordingService
        self.displaySettingsViewModel = displaySettingsViewModel
        displaySettingsViewModel.bindGarminService(garminService)
        windEstimationViewModel.bindGarminService(garminService)

        guard watchMessageTask == nil else {
            return
        }

        watchMessageTask = Task {
            await garminService.start()

            Task {
                for await state in garminService.connectionStateStream {
                    if case .connected = state {
                        displaySettingsViewModel.syncDisplayConfigToWatch()
                    }
                }
            }

            for await message in garminService.messageStream {
                switch message {
                case let .startTimer(timestamp):
                    await raceTimerViewModel.applyWatchStart(at: timestamp)
                    self.sessionRecordingService?.noteDeviceGun(Date(timeIntervalSince1970: timestamp))
                    displaySettingsViewModel.triggerBrightnessBoost()
                case let .countdownHalted(remainingSeconds):
                    raceTimerViewModel.applyWatchCountdownHalted(remainingSeconds: remainingSeconds)
                case let .screenSync(screen):
                    applyWatchScreen(screen, displayTier: displaySettingsViewModel.settings.displayTier)
                    if screen == .headingHeel || screen == .trimTurn || screen == .sog,
                       raceTimerViewModel.isCountdownActive {
                        displaySettingsViewModel.triggerBrightnessBoost()
                    }
                case .activityEnded:
                    raceTimerViewModel.applyWatchActivityEnded()
                    self.sessionRecordingService?.endSession(showActivityEndPrompt: true)
                    userLandscapeScreen = .headingHeel
                    phoneNavigationOverride = false
                    windEstimationViewModel.resetSession()
                case let .gpsSample(sample):
                    gpsSample = sample
                    windEstimationViewModel.ingestGps(sample)
                case let .baseWindSet(degrees):
                    windEstimationViewModel.setBaseWind(from: degrees)
                }
            }
        }

        Task {
            for await sample in attitudeViewModel.$latestSample.values {
                guard let sample else { continue }
                self.sessionRecordingService?.ingestAttitude(
                    sample,
                    windDegrees: windEstimationViewModel.snapshot.windDegrees
                )
                windEstimationViewModel.ingestAttitude(sample)
            }
        }
    }

    func landscapeScreen(
        timerState: RaceTimerState,
        displayTier: DisplayTier,
        startPostponed: Bool = false
    ) -> LandscapeScreen {
        if startPostponed {
            return .countdown
        }
        if case .countdown = timerState.phase {
            return .countdown
        }
        return userLandscapeScreen.resolvedForDisplayTier(displayTier)
    }

    func showNextLandscapeScreen(displayTier: DisplayTier) {
        userLandscapeScreen = userLandscapeScreen.next(allowsSog: displayTier.allowsSog)
        phoneNavigationOverride = true
    }

    func showPreviousLandscapeScreen(displayTier: DisplayTier) {
        userLandscapeScreen = userLandscapeScreen.previous(allowsSog: displayTier.allowsSog)
        phoneNavigationOverride = true
    }

    private func applyWatchScreen(_ screen: WatchMirroredScreen, displayTier: DisplayTier) {
        let mapped = LandscapeScreen(watchScreen: screen).resolvedForDisplayTier(displayTier)

        if phoneNavigationOverride {
            if mapped == lastWatchSyncedScreen {
                return
            }
            if mapped != userLandscapeScreen.resolvedForDisplayTier(displayTier) {
                userLandscapeScreen = mapped
                phoneNavigationOverride = false
            }
            lastWatchSyncedScreen = mapped
            return
        }

        userLandscapeScreen = mapped
        lastWatchSyncedScreen = mapped
    }
}

enum LandscapeScreen: Equatable, CaseIterable {
    case countdown
    case headingHeel
    case trimTurn
    case sog

    init(watchScreen: WatchMirroredScreen) {
        switch watchScreen {
        case .countdown:
            self = .countdown
        case .headingHeel:
            self = .headingHeel
        case .trimTurn:
            self = .trimTurn
        case .sog:
            self = .sog
        }
    }

    static func racingScreens(allowsSog: Bool) -> [LandscapeScreen] {
        if allowsSog {
            return [.headingHeel, .trimTurn, .sog]
        }
        return [.headingHeel, .trimTurn]
    }

    func resolvedForDisplayTier(_ tier: DisplayTier) -> LandscapeScreen {
        if self == .sog, !tier.allowsSog {
            return .headingHeel
        }
        return self
    }

    func next(allowsSog: Bool) -> LandscapeScreen {
        let screens = LandscapeScreen.racingScreens(allowsSog: allowsSog)
        guard let index = screens.firstIndex(of: self) else {
            return screens.first ?? .headingHeel
        }
        return screens[(index + 1) % screens.count]
    }

    func previous(allowsSog: Bool) -> LandscapeScreen {
        let screens = LandscapeScreen.racingScreens(allowsSog: allowsSog)
        guard let index = screens.firstIndex(of: self) else {
            return screens.last ?? .headingHeel
        }
        let previousIndex = (index - 1 + screens.count) % screens.count
        return screens[previousIndex]
    }
}
