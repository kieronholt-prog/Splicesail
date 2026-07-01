import SwiftUI

/// Landscape heading (top 4/5) + heel bar (bottom 1/5).
struct LandscapeHeadingHeelView: View {
    let sample: AttitudeSample?
    @ObservedObject var displaySettings: DisplaySettingsViewModel

    @StateObject private var heelHistory = HeelRangeTracker()
    @State private var pruneTimer = Timer.publish(every: 0.25, on: .main, in: .common).autoconnect()

    var body: some View {
        GeometryReader { proxy in
            let headingHeight = proxy.size.height * 0.8
            let heelBarHeight = proxy.size.height * 0.2

            ZStack {
                LandscapeTheme.background.ignoresSafeArea()

                if let sample, sample.isLandscapePose, let heading = sample.headingDegrees {
                    VStack(spacing: 0) {
                        Text("\(heading)°")
                            .font(LandscapeTheme.valueFont(size: 400, style: displaySettings.settings.valueFontStyle))
                            .monospacedDigit()
                            .minimumScaleFactor(0.01)
                            .lineLimit(1)
                            .foregroundStyle(LandscapeTheme.primary)
                            .frame(width: proxy.size.width * 0.96, height: headingHeight)
                            .transaction { transaction in
                                transaction.animation = nil
                            }

                        HeelBarView(
                            heelDegrees: sample.displayHeelDegrees,
                            minHeel: heelHistory.minHeel,
                            maxHeel: heelHistory.maxHeel
                        )
                        .frame(height: heelBarHeight)
                        .padding(.horizontal, 16)
                        .padding(.bottom, 8)
                    }
                } else {
                    waitingContent(sample: sample, height: proxy.size.height)
                }
            }
        }
        .persistentSystemOverlays(.hidden)
        .onAppear {
            heelHistory.reset()
            if let sample {
                heelHistory.record(heelDegrees: sample.displayHeelDegrees)
            }
        }
        .onChange(of: sample?.displayHeelDegrees) { _, heel in
            guard let heel else { return }
            heelHistory.record(heelDegrees: heel)
        }
        .onReceive(pruneTimer) { _ in
            guard let sample else { return }
            heelHistory.record(heelDegrees: sample.displayHeelDegrees)
        }
    }

    @ViewBuilder
    private func waitingContent(sample: AttitudeSample?, height: CGFloat) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "iphone.landscape")
                .font(.system(size: 48, weight: .heavy))
            Text("Mount phone in landscape bracket")
                .font(LandscapeTheme.labelFont(size: 22, style: displaySettings.settings.labelFontStyle))
            if let sample {
                Text("Roll \(Int(sample.rawRollDegrees.rounded()))°")
                    .font(LandscapeTheme.labelFont(size: 12, style: displaySettings.settings.labelFontStyle))
                    .foregroundStyle(LandscapeTheme.muted)
                    .monospacedDigit()
            }
        }
        .foregroundStyle(LandscapeTheme.primary)
        .frame(height: height)
    }
}
