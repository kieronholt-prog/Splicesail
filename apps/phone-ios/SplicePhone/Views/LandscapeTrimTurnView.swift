import SwiftUI

/// Landscape trim bar (left) + turn dial (right) — hub on screen centreline.
struct LandscapeTrimTurnView: View {
    let sample: AttitudeSample?
    @ObservedObject var displaySettings: DisplaySettingsViewModel

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                LandscapeTheme.background.ignoresSafeArea()

                if let sample, sample.isLandscapePose {
                    let midX = proxy.size.width / 2
                    let cy = proxy.size.height / 2
                    let trimLayout = TrimBarMetrics(panelWidth: midX)
                    let headerFont = LandscapeTheme.labelFont(
                        size: 14,
                        style: displaySettings.settings.labelFontStyle
                    )

                    Path { path in
                        path.move(to: CGPoint(x: 12, y: cy))
                        path.addLine(to: CGPoint(x: proxy.size.width - 12, y: cy))
                    }
                    .stroke(LandscapeTheme.label, lineWidth: 1)

                    HStack(spacing: 0) {
                        TrimBarView(
                            trimDegrees: sample.displayTrimDegreesInt,
                            labelFont: headerFont
                        )
                        .frame(width: midX)

                        Color.clear
                            .frame(width: midX)
                    }

                    TurnRateDialView(
                        turnDegreesPerSecond: sample.turnDegreesPerSecond,
                        maxDegreesPerSecond: ConnectIQConstants.turnDialMaxDegreesPerSecond,
                        hubX: midX,
                        clipMinX: midX,
                        labelFont: headerFont
                    )
                    .allowsHitTesting(false)
                    .transaction { transaction in
                        transaction.animation = nil
                    }

                    let turnInset = max(midX * 0.05, 12)

                    Text("TRIM")
                        .font(headerFont)
                        .foregroundStyle(LandscapeTheme.label)
                        .position(x: trimLayout.headerX, y: 14)

                    Text("TURN")
                        .font(headerFont)
                        .foregroundStyle(LandscapeTheme.label)
                        .position(x: proxy.size.width - turnInset, y: 14)
                        .frame(width: 40, alignment: .trailing)
                } else {
                    VStack(spacing: 16) {
                        Image(systemName: "iphone.landscape")
                            .font(.system(size: 48, weight: .heavy))
                        Text("Mount phone in landscape bracket")
                            .font(LandscapeTheme.labelFont(size: 22, style: displaySettings.settings.labelFontStyle))
                    }
                    .foregroundStyle(LandscapeTheme.primary)
                }
            }
        }
        .persistentSystemOverlays(.hidden)
    }
}
