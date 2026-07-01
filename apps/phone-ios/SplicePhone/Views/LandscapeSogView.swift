import SwiftUI

/// Landscape speed — vertical split: VMG left, SOG right (phone-computed VMG).
struct LandscapeSogView: View {
    let gpsSample: WatchGpsSample?
    @ObservedObject var windEstimation: WindEstimationViewModel
    @ObservedObject var displaySettings: DisplaySettingsViewModel

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                LandscapeTheme.background.ignoresSafeArea()

                HStack(spacing: 0) {
                    speedHalf(
                        title: vmgTitle,
                        value: vmgValue,
                        width: proxy.size.width / 2,
                        height: proxy.size.height
                    ) {
                        vmgAngleBlock
                    }

                    Rectangle()
                        .fill(LandscapeTheme.label.opacity(0.35))
                        .frame(width: 1)

                    speedHalf(
                        title: "SOG",
                        value: sogValue,
                        width: proxy.size.width / 2,
                        height: proxy.size.height
                    ) {
                        statusText(sogStatusLabel)
                    }
                }
            }
        }
        .persistentSystemOverlays(.hidden)
    }

    @ViewBuilder
    private func speedHalf<Subtitle: View>(
        title: String,
        value: String,
        width: CGFloat,
        height: CGFloat,
        @ViewBuilder subtitle: () -> Subtitle
    ) -> some View {
        VStack(spacing: 8) {
            Text(title)
                .font(LandscapeTheme.labelFont(size: 22, style: displaySettings.settings.labelFontStyle))
                .foregroundStyle(LandscapeTheme.label)

            Text(value)
                .font(LandscapeTheme.valueFont(size: min(width * 0.4, 120), style: displaySettings.settings.valueFontStyle))
                .monospacedDigit()
                .foregroundStyle(LandscapeTheme.primary)

            subtitle()
                .padding(.horizontal, 8)
        }
        .frame(width: width, height: height)
    }

    private func statusText(_ text: String) -> some View {
        Text(text)
            .font(LandscapeTheme.labelFont(size: 14, style: displaySettings.settings.labelFontStyle))
            .foregroundStyle(LandscapeTheme.muted)
            .multilineTextAlignment(.center)
    }

    @ViewBuilder
    private var vmgAngleBlock: some View {
        if !displaySettings.settings.displayTier.allowsVmg {
            Text("Enable Pro+ in phone settings")
                .font(LandscapeTheme.labelFont(size: 14, style: displaySettings.settings.labelFontStyle))
                .foregroundStyle(LandscapeTheme.muted)
                .multilineTextAlignment(.center)
        } else {
            VStack(spacing: 6) {
                HStack(spacing: 16) {
                    angleLabel("TWD", windEstimation.snapshot.windDegrees)
                    angleLabel("WA", windEstimation.snapshot.windAngleDegrees)
                }
                angleLabel("COG", gpsSample?.cogDegrees)
                Text(windEstimation.snapshot.statusMessage)
                    .font(LandscapeTheme.labelFont(size: 12, style: displaySettings.settings.labelFontStyle))
                    .foregroundStyle(windEstimation.snapshot.possibleShift ? .orange : LandscapeTheme.muted)
                    .multilineTextAlignment(.center)
            }
            .font(LandscapeTheme.labelFont(size: 14, style: displaySettings.settings.labelFontStyle))
            .foregroundStyle(LandscapeTheme.muted)
        }
    }

    private func angleLabel(_ label: String, _ degrees: Double?) -> some View {
        Text("\(label) \(formatBearing(degrees))")
            .monospacedDigit()
    }

    private var vmgTitle: String {
        switch windEstimation.snapshot.displayMode {
        case .upwind:
            return "UW VMG"
        case .downwind:
            return "DW VMG"
        }
    }

    private var vmgValue: String {
        guard displaySettings.settings.displayTier.allowsVmg else {
            return "—"
        }
        guard let vmg = windEstimation.snapshot.vmgKnots else {
            return "—"
        }
        return String(format: "%.1f", vmg)
    }

    private func formatBearing(_ degrees: Double?) -> String {
        guard let degrees else {
            return "—"
        }
        let rounded = Int(degrees.rounded()) % 360
        return String(format: "%03d", rounded < 0 ? rounded + 360 : rounded)
    }

    private var sogValue: String {
        guard let gpsSample, gpsSample.hasFix else {
            return "—"
        }
        return String(format: "%.1f", gpsSample.sogKnots)
    }

    private var sogStatusLabel: String {
        guard gpsSample != nil else {
            return "Waiting for watch GPS…"
        }
        guard gpsSample?.hasFix == true else {
            return "Acquiring GPS…"
        }
        return "Watch GPS"
    }
}
