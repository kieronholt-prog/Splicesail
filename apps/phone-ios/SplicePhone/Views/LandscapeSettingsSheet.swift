import SwiftUI

struct LandscapeSettingsSheet: View {
    @ObservedObject var attitudeViewModel: AttitudeViewModel
    @ObservedObject var displaySettingsViewModel: DisplaySettingsViewModel
    @ObservedObject var windEstimationViewModel: WindEstimationViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("Mount calibration") {
                    Text("Default reference: heel with the phone horizontal in the landscape bracket; trim with the phone face-vertical and the bow level. Zero buttons apply an offset from that baseline.")
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

                DisplayTierPickerSection(
                    displaySettingsViewModel: displaySettingsViewModel,
                    footer: "Core: countdown and heading. Pro adds live SOG from watch GPS. Pro+ adds phone-computed VMG."
                )

                SailingConditionsSection(
                    windEstimationViewModel: windEstimationViewModel,
                    attitudeViewModel: attitudeViewModel
                )

                Section("Screen brightness") {
                    brightnessRow("Default", value: displaySettingsViewModel.binding(\.defaultBrightness))
                    brightnessRow(
                        "Racing (countdown, heading, trim, SOG)",
                        value: displaySettingsViewModel.binding(\.countdownBrightness)
                    )
                    brightnessRow("Boost (Start)", value: displaySettingsViewModel.binding(\.boostBrightness))
                    Stepper(
                        "Boost duration: \(displaySettingsViewModel.settings.boostDurationSeconds)s",
                        value: displaySettingsViewModel.binding(\.boostDurationSeconds),
                        in: 5...120,
                        step: 5
                    )
                }

                Section("Landscape fonts") {
                    Picker("Field labels", selection: displaySettingsViewModel.binding(\.labelFontStyle)) {
                        ForEach(DisplayFontStyle.allCases) { style in
                            Text(style.label).tag(style)
                        }
                    }
                    Picker("Display values", selection: displaySettingsViewModel.binding(\.valueFontStyle)) {
                        ForEach(DisplayFontStyle.allCases) { style in
                            Text(style.label).tag(style)
                        }
                    }

                    fontPreview(
                        title: "Label preview",
                        text: "HEADING",
                        style: displaySettingsViewModel.settings.labelFontStyle,
                        size: 18
                    )
                    fontPreview(
                        title: "Value preview",
                        text: "273°",
                        style: displaySettingsViewModel.settings.valueFontStyle,
                        size: 36
                    )
                }
            }
            .navigationTitle("Landscape settings")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }

    private func brightnessRow(_ title: String, value: Binding<Double>) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(title)
                Spacer()
                Text("\(Int(value.wrappedValue * 100))%")
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
            Slider(value: value, in: 0.05...1.0)
        }
    }

    private func fontPreview(title: String, text: String, style: DisplayFontStyle, size: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(text)
                .font(LandscapeTheme.valueFont(size: size, style: style))
                .foregroundStyle(.yellow)
        }
        .padding(.vertical, 4)
    }
}
