import SwiftUI

struct LandscapeShellView<Content: View>: View {
    @ObservedObject var attitudeViewModel: AttitudeViewModel
    @ObservedObject var raceTimerViewModel: RaceTimerViewModel
    @ObservedObject var displaySettingsViewModel: DisplaySettingsViewModel
    @ObservedObject var appShellViewModel: AppShellViewModel
    let screen: LandscapeScreen
    @ViewBuilder let content: () -> Content

    @State private var showSettings = false

    private var isCountdownRunning: Bool {
        if case .countdown = raceTimerViewModel.timerState.phase {
            return true
        }
        return false
    }

    private var isRacingSession: Bool {
        raceTimerViewModel.timerState.startGunUTC != nil
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            content()

            Button {
                showSettings = true
            } label: {
                Image(systemName: "gearshape.fill")
                    .font(.title3.weight(.heavy))
                    .foregroundStyle(LandscapeTheme.label)
                    .padding(14)
                    .background(Color.black.opacity(0.35), in: Circle())
            }
            .padding(.leading, 12)
            .padding(.top, 8)

            if !isCountdownRunning {
                landscapePageIndicator
            }
        }
        .contentShape(Rectangle())
        .highPriorityGesture(landscapeSwipeGesture)
        .background(LandscapeTheme.background.ignoresSafeArea())
        .onAppear {
            displaySettingsViewModel.updateLandscapeContext(
                screen: screen,
                isCountdownRunning: isCountdownRunning,
                isRacingSession: isRacingSession
            )
        }
        .onChange(of: screen) { _, newScreen in
            displaySettingsViewModel.updateLandscapeContext(
                screen: newScreen,
                isCountdownRunning: isCountdownRunning,
                isRacingSession: isRacingSession
            )
        }
        .onChange(of: raceTimerViewModel.timerState) { _, _ in
            displaySettingsViewModel.updateLandscapeContext(
                screen: screen,
                isCountdownRunning: isCountdownRunning,
                isRacingSession: isRacingSession
            )
        }
        .onDisappear {
            displaySettingsViewModel.onLandscapeDisappeared()
        }
        .sheet(isPresented: $showSettings) {
            LandscapeSettingsSheet(
                attitudeViewModel: attitudeViewModel,
                displaySettingsViewModel: displaySettingsViewModel,
                windEstimationViewModel: appShellViewModel.windEstimationViewModel
            )
        }
    }

    private var landscapePageIndicator: some View {
        let allowsSog = displaySettingsViewModel.settings.displayTier.allowsSog
        let pages = LandscapeScreen.racingScreens(allowsSog: allowsSog)

        return HStack(spacing: 8) {
            ForEach(Array(pages.enumerated()), id: \.offset) { _, page in
                Circle()
                    .fill(page == screen ? LandscapeTheme.primary : LandscapeTheme.label.opacity(0.35))
                    .frame(width: page == screen ? 8 : 6, height: page == screen ? 8 : 6)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        .padding(.bottom, 10)
        .allowsHitTesting(false)
    }

    private var landscapeSwipeGesture: some Gesture {
        DragGesture(minimumDistance: 48)
            .onEnded { value in
                guard !isCountdownRunning else {
                    return
                }
                let horizontal = value.translation.width
                let vertical = value.translation.height
                guard abs(horizontal) > abs(vertical), abs(horizontal) >= 48 else {
                    return
                }
                let tier = displaySettingsViewModel.settings.displayTier
                if horizontal < 0 {
                    appShellViewModel.showNextLandscapeScreen(displayTier: tier)
                } else {
                    appShellViewModel.showPreviousLandscapeScreen(displayTier: tier)
                }
            }
    }
}
