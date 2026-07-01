import SwiftUI
import UIKit

@MainActor
final class DisplaySettingsViewModel: ObservableObject {
    @Published var settings: DisplaySettings {
        didSet {
            DisplaySettingsStore.save(settings)
            applyBrightnessIfNeeded()
            if oldValue.displayTier != settings.displayTier {
                syncDisplayConfigToWatch()
            }
        }
    }

    @Published private(set) var isBoostActive = false

    private var boostTask: Task<Void, Never>?
    private var currentLandscapeScreen: LandscapeScreen?
    private var isCountdownRunning = false
    private var isRacingSession = false
    private var savedBrightness: CGFloat?
    private weak var garminService: GarminCIQConnectable?

    init() {
        settings = DisplaySettingsStore.load()
    }

    func bindGarminService(_ service: GarminCIQConnectable) {
        garminService = service
        service.onWatchLinkReady = { [weak self] in
            self?.syncDisplayConfigToWatch()
        }
        syncDisplayConfigToWatch()
        Task { [weak self] in
            for delaySeconds in [2.0, 5.0, 10.0] {
                try? await Task.sleep(nanoseconds: UInt64(delaySeconds * 1_000_000_000))
                self?.syncDisplayConfigToWatch()
            }
        }
    }

    func syncDisplayConfigToWatch() {
        guard let garminService else {
            return
        }
        let tier = settings.displayTier
        Task {
            await garminService.sendDisplayConfig(tier: tier)
        }
    }

    deinit {
        boostTask?.cancel()
    }

    func binding<T>(_ keyPath: WritableKeyPath<DisplaySettings, T>) -> Binding<T> {
        Binding(
            get: { self.settings[keyPath: keyPath] },
            set: { newValue in
                var updated = self.settings
                updated[keyPath: keyPath] = newValue
                self.settings = updated
            }
        )
    }

    func updateLandscapeContext(
        screen: LandscapeScreen,
        isCountdownRunning: Bool,
        isRacingSession: Bool
    ) {
        currentLandscapeScreen = screen
        self.isCountdownRunning = isCountdownRunning
        self.isRacingSession = isRacingSession
        applyBrightnessIfNeeded()
        updateIdleTimer()
    }

    func onLandscapeDisappeared() {
        currentLandscapeScreen = nil
        isCountdownRunning = false
        isRacingSession = false
        boostTask?.cancel()
        isBoostActive = false
        UIApplication.shared.isIdleTimerDisabled = false
        restoreBrightnessIfNeeded()
    }

    func triggerBrightnessBoost() {
        boostTask?.cancel()
        isBoostActive = true
        applyBrightnessIfNeeded()

        let duration = UInt64(settings.boostDurationSeconds) * 1_000_000_000
        boostTask = Task {
            try? await Task.sleep(nanoseconds: duration)
            guard !Task.isCancelled else {
                return
            }
            isBoostActive = false
            applyBrightnessIfNeeded()
        }
    }

    private func applyBrightnessIfNeeded() {
        guard currentLandscapeScreen != nil else {
            return
        }

        if savedBrightness == nil {
            savedBrightness = UIScreen.main.brightness
        }

        let level: Double
        if isBoostActive {
            level = settings.boostBrightness
        } else if usesRacingBrightness {
            level = settings.countdownBrightness
        } else {
            level = settings.defaultBrightness
        }

        UIScreen.main.brightness = CGFloat(min(1, max(0.01, level)))
    }

    private var usesRacingBrightness: Bool {
        guard let screen = currentLandscapeScreen else {
            return false
        }
        switch screen {
        case .countdown:
            return true
        case .headingHeel, .trimTurn, .sog:
            return isCountdownRunning || isRacingSession
        }
    }

    private func restoreBrightnessIfNeeded() {
        if let savedBrightness {
            UIScreen.main.brightness = savedBrightness
            self.savedBrightness = nil
        }
    }

    private func updateIdleTimer() {
        guard let screen = currentLandscapeScreen else {
            UIApplication.shared.isIdleTimerDisabled = false
            return
        }
        let keepAwake = screen == .countdown || screen == .headingHeel || screen == .sog
        UIApplication.shared.isIdleTimerDisabled = keepAwake
    }
}
