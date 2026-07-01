import SwiftUI

struct PortraitSetupView: View {
    @ObservedObject var attitudeViewModel: AttitudeViewModel
    @ObservedObject var raceTimerViewModel: RaceTimerViewModel
    @ObservedObject var displaySettingsViewModel: DisplaySettingsViewModel

    var body: some View {
        NavigationStack {
            List {
                Section("Garmin Connect IQ") {
                    Label(attitudeViewModel.phoneLinkStatusLabel, systemImage: "applewatch")
                    Button("Pair watch") {
                        attitudeViewModel.showGarminDeviceSelection()
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Compass data flows via the Connect IQ Mobile SDK (through Garmin Connect). No custom BLE GATT — works alongside Garmin Connect Mobile.")
                        Text("Tap Pair watch, select your watch in Garmin Connect, then wait for Garmin Connect to return you to Splice automatically (do not switch apps manually).")
                        Text("Open Splice on the watch from the apps list (do not rely on the phone to launch it). Swipe left for the compass screen.")
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }

                Section("Mount calibration") {
                    Text("Default reference: heel with the phone horizontal in the landscape bracket; trim with the phone face-vertical and the bow level. Zero buttons apply an offset from that baseline. Do not zero heading.")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    ZeroOffsetButton(
                        title: "Zero heel",
                        hasOffset: attitudeViewModel.hasHeelZeroOffset
                    ) {
                        attitudeViewModel.zeroHeel()
                    }

                    ZeroOffsetButton(
                        title: "Zero trim",
                        hasOffset: attitudeViewModel.hasTrimZeroOffset
                    ) {
                        attitudeViewModel.zeroTrim()
                    }

                    Button("Clear zero offsets", role: .destructive) {
                        attitudeViewModel.clearZeroOffsets()
                    }
                }

                Section("Live attitude (landscape mount)") {
                    if let sample = attitudeViewModel.latestSample {
                        LabeledContent("Landscape pose") {
                            Text(sample.isLandscapePose ? "Yes" : "No")
                        }
                        if let side = sample.landscapeSide {
                            LabeledContent("Mount side") {
                                Text(side == .left ? "Left" : "Right")
                            }
                        }
                        LabeledContent("Heading") {
                            Text(formatHeading(sample.headingDegrees))
                        }
                        LabeledContent("Heel") {
                            Text(formatHeel(sample.displayHeelDegreesInt))
                        }
                        LabeledContent("Trim") {
                            Text(formatTrim(sample.displayTrimDegreesInt))
                        }
                    } else {
                        Text("Waiting for motion…")
                            .foregroundStyle(.secondary)
                    }
                }

                DisplayTierPickerSection(
                    displaySettingsViewModel: displaySettingsViewModel,
                    footer: "Synced to your watch when connected. Pro enables SOG — GPS warms up when you open Splice on the watch; the FIT track starts when you start the countdown."
                )

                Section("Start sequence") {
                    Stepper(
                        "Countdown: \(raceTimerViewModel.countdownMinutes) min",
                        value: $raceTimerViewModel.countdownMinutes,
                        in: 1...30
                    )

                    Button("Arm countdown") {
                        raceTimerViewModel.armCountdownFromPhone()
                    }

                    if raceTimerViewModel.timerState.startGunUTC != nil {
                        Button("Reset timer", role: .destructive) {
                            raceTimerViewModel.resetTimer()
                        }
                    }

                    if let syncMessage = raceTimerViewModel.syncMessage {
                        Text(syncMessage)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }

                    Text("Rotate to landscape to mirror the watch: Countdown, Heading & Heel, Trim & Turn, or SOG (Pro). Countdown syncs when you start, stop, or adjust on either device.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Splice")
        }
    }

    private func formatHeading(_ degrees: Int?) -> String {
        guard let degrees else {
            return "— (mount in landscape)"
        }
        return "\(degrees)°"
    }

    private func formatHeel(_ degrees: Int) -> String {
        if degrees > 0 { return "\(degrees)° P" }
        if degrees < 0 { return "\(-degrees)° S" }
        return "0°"
    }

    private func formatTrim(_ degrees: Int) -> String {
        if degrees > 0 { return "\(degrees)° U" }
        if degrees < 0 { return "\(-degrees)° D" }
        return "0°"
    }
}
