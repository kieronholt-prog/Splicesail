import SwiftUI

struct ContentView: View {
    @ObservedObject var attitudeViewModel: AttitudeViewModel
    @ObservedObject var raceTimerViewModel: RaceTimerViewModel
    @ObservedObject var appShellViewModel: AppShellViewModel
    @ObservedObject var displaySettingsViewModel: DisplaySettingsViewModel
    @ObservedObject var raceDayViewModel: RaceDayViewModel
    @ObservedObject var postRaceViewModel: PostRaceViewModel
    @ObservedObject var sessionRecordingService: SessionRecordingService

    var body: some View {
        GeometryReader { geometry in
            let isLandscape = geometry.size.width > geometry.size.height
            Group {
                if isLandscape {
                    landscapeRoot
                } else {
                    portraitRoot
                }
            }
            .frame(width: geometry.size.width, height: geometry.size.height)
            .animation(.easeInOut(duration: 0.2), value: isLandscape)
        }
        .sheet(item: $sessionRecordingService.activityEndPrompt) { prompt in
            PortraitActivityEndSheet(
                prompt: prompt,
                raceDayViewModel: raceDayViewModel,
                onDismiss: { sessionRecordingService.dismissActivityEndPrompt() }
            )
        }
    }

    @ViewBuilder
    private var landscapeRoot: some View {
        let screen = appShellViewModel.landscapeScreen(
            timerState: raceTimerViewModel.timerState,
            displayTier: displaySettingsViewModel.settings.displayTier,
            startPostponed: raceTimerViewModel.startPostponed
        )

        LandscapeShellView(
            attitudeViewModel: attitudeViewModel,
            raceTimerViewModel: raceTimerViewModel,
            displaySettingsViewModel: displaySettingsViewModel,
            appShellViewModel: appShellViewModel,
            screen: screen
        ) {
            switch screen {
            case .countdown:
                LandscapeCountdownView(
                    viewModel: raceTimerViewModel,
                    displaySettings: displaySettingsViewModel
                )
            case .headingHeel:
                LandscapeHeadingHeelView(
                    sample: attitudeViewModel.latestSample,
                    displaySettings: displaySettingsViewModel
                )
            case .trimTurn:
                LandscapeTrimTurnView(
                    sample: attitudeViewModel.latestSample,
                    displaySettings: displaySettingsViewModel
                )
            case .sog:
                LandscapeSogView(
                    gpsSample: appShellViewModel.gpsSample,
                    windEstimation: appShellViewModel.windEstimationViewModel,
                    displaySettings: displaySettingsViewModel
                )
            }
        }
    }

    private var portraitRoot: some View {
        TabView {
            PortraitSetupView(
                attitudeViewModel: attitudeViewModel,
                raceTimerViewModel: raceTimerViewModel,
                displaySettingsViewModel: displaySettingsViewModel
            )
            .tabItem {
                Label("Setup", systemImage: "gearshape")
            }

            PortraitRaceView(
                viewModel: raceDayViewModel,
                sessionRecording: sessionRecordingService
            )
            .tabItem {
                Label("Race", systemImage: "flag.checkered")
            }

            PortraitResultsView(
                postRaceViewModel: postRaceViewModel,
                raceDayViewModel: raceDayViewModel
            )
            .tabItem {
                Label("Results", systemImage: "trophy")
            }

            PortraitAnalysisView(
                postRaceViewModel: postRaceViewModel,
                raceDayViewModel: raceDayViewModel
            )
                .tabItem {
                    Label("Analysis", systemImage: "chart.xyaxis.line")
                }
        }
    }
}

#Preview("Portrait") {
    let motion = MockMotionService()
    let garmin = MockGarminCIQService()
    let recording = SessionRecordingService()
    let auth = MockSpliceAuthService()
    let timer = RaceTimerViewModel(garminService: garmin)
    let postRace = PostRaceViewModel(auth: auth)
    return ContentView(
        attitudeViewModel: AttitudeViewModel(motionService: motion, garminService: garmin),
        raceTimerViewModel: timer,
        appShellViewModel: AppShellViewModel(),
        displaySettingsViewModel: DisplaySettingsViewModel(),
        raceDayViewModel: RaceDayViewModel(
            auth: auth,
            garmin: garmin,
            sessionRecording: recording,
            raceTimerViewModel: timer
        ),
        postRaceViewModel: postRace,
        sessionRecordingService: recording
    )
}
