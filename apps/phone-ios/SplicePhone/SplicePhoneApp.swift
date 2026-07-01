import ConnectIQ
import SwiftUI

@main
struct SplicePhoneApp: App {
    @UIApplicationDelegateAdaptor(ConnectIQAppDelegate.self) private var appDelegate
    @StateObject private var attitudeViewModel: AttitudeViewModel
    @StateObject private var raceTimerViewModel: RaceTimerViewModel
    @StateObject private var appShellViewModel = AppShellViewModel()
    @StateObject private var displaySettingsViewModel = DisplaySettingsViewModel()
    @StateObject private var sessionRecordingService: SessionRecordingService
    @StateObject private var raceDayViewModel: RaceDayViewModel
    @StateObject private var postRaceViewModel: PostRaceViewModel

    init() {
        ConnectIQ.sharedInstance().initialize(
            withUrlScheme: ConnectIQConstants.returnURLScheme,
            uiOverrideDelegate: nil,
            stateRestorationIdentifier: ConnectIQConstants.stateRestorationIdentifier
        )

        let motionService: MotionConnectable = MotionService()
        let garminService: GarminCIQConnectable = GarminCIQService()
        let auth = SpliceAuthService()
        let timer = RaceTimerViewModel(garminService: garminService)
        let trackUpload = TrackUploadService(auth: auth)
        let recording = SessionRecordingService(trackUpload: trackUpload)
        trackUpload.attach(sessionRecording: recording)

        _attitudeViewModel = StateObject(
            wrappedValue: AttitudeViewModel(motionService: motionService, garminService: garminService)
        )
        _raceTimerViewModel = StateObject(wrappedValue: timer)
        _sessionRecordingService = StateObject(wrappedValue: recording)
        _postRaceViewModel = StateObject(wrappedValue: PostRaceViewModel(auth: auth))
        _raceDayViewModel = StateObject(
            wrappedValue: RaceDayViewModel(
                auth: auth,
                garmin: garminService,
                sessionRecording: recording,
                raceTimerViewModel: timer
            )
        )
    }

    var body: some Scene {
        WindowGroup {
            ContentView(
                attitudeViewModel: attitudeViewModel,
                raceTimerViewModel: raceTimerViewModel,
                appShellViewModel: appShellViewModel,
                displaySettingsViewModel: displaySettingsViewModel,
                raceDayViewModel: raceDayViewModel,
                postRaceViewModel: postRaceViewModel,
                sessionRecordingService: sessionRecordingService
            )
            .onAppear {
                wireDeviceSelectionHandler()
                attitudeViewModel.start()
                appShellViewModel.start(
                    garminService: attitudeViewModel.garminService,
                    raceTimerViewModel: raceTimerViewModel,
                    displaySettingsViewModel: displaySettingsViewModel,
                    attitudeViewModel: attitudeViewModel,
                    sessionRecordingService: sessionRecordingService
                )
            }
            .task {
                await raceDayViewModel.bootstrap()
            }
            .task(id: raceDayViewModel.isSignedIn) {
                postRaceViewModel.syncAuthState()
                guard raceDayViewModel.isSignedIn else { return }
                await postRaceViewModel.refresh()
            }
            .task {
                await raceDayViewModel.runBackgroundRaceSync()
            }
            .onOpenURL { url in
                attitudeViewModel.handleDeviceSelectionURL(url)
            }
        }
    }

    private func wireDeviceSelectionHandler() {
        appDelegate.onOpenURL = { url in
            Task { @MainActor in
                attitudeViewModel.handleDeviceSelectionURL(url)
            }
        }
    }
}
