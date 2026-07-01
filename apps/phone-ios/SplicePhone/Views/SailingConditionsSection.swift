import SwiftUI

struct SailingConditionsSection: View {
    @ObservedObject var windEstimationViewModel: WindEstimationViewModel
    @ObservedObject var attitudeViewModel: AttitudeViewModel

    var body: some View {
        Section {
            Picker("Tide / current", selection: $windEstimationViewModel.settings.tide) {
                ForEach(TideSetting.allCases) { tide in
                    Text(tide.label).tag(tide)
                }
            }
            .onChange(of: windEstimationViewModel.settings.tide) { _, _ in
                windEstimationViewModel.applySettings()
            }

            Picker("Wind conditions", selection: $windEstimationViewModel.settings.wind) {
                ForEach(WindSetting.allCases) { wind in
                    Text(wind.label).tag(wind)
                }
            }
            .onChange(of: windEstimationViewModel.settings.wind) { _, _ in
                windEstimationViewModel.applySettings()
            }

            Stepper(
                "Expected tacking angle: \(Int(windEstimationViewModel.settings.expectedTackingAngle))°",
                value: $windEstimationViewModel.settings.expectedTackingAngle,
                in: 60...130,
                step: 5
            )
            .onChange(of: windEstimationViewModel.settings.expectedTackingAngle) { _, _ in
                windEstimationViewModel.applySettings()
            }

            if let baseWind = windEstimationViewModel.settings.baseWindDegrees {
                HStack {
                    Text("Base wind")
                    Spacer()
                    Text(formatBearing(baseWind))
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                }
            }

            Button("Set base wind from current heading") {
                if let heading = attitudeViewModel.latestSample?.headingDegrees {
                    windEstimationViewModel.setBaseWind(from: Double(heading))
                }
            }
            .disabled(attitudeViewModel.latestSample?.headingDegrees == nil)
        } header: {
            Text("Sailing conditions (Pro+)")
        } footer: {
            Text("VMG and wind direction are computed on the phone. The watch displays VMG values sent from the phone.")
        }
    }

    private func formatBearing(_ degrees: Double) -> String {
        let rounded = Int(degrees.rounded()) % 360
        return String(format: "%03d°", rounded < 0 ? rounded + 360 : rounded)
    }
}
