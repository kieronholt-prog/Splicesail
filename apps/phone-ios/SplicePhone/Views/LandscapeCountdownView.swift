import SwiftUI

/// Full-landscape race countdown — synced to the watch via gun UTC timestamp.
struct LandscapeCountdownView: View {
    @ObservedObject var viewModel: RaceTimerViewModel
    @ObservedObject var displaySettings: DisplaySettingsViewModel

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                LandscapeTheme.background.ignoresSafeArea()

                if viewModel.startPostponed {
                    StartPostponedBanner()
                        .foregroundStyle(LandscapeTheme.primary)
                } else if let gun = viewModel.timerState.startGunUTC {
                    TimelineView(.periodic(from: .now, by: 1.0)) { timeline in
                        let state = RaceTimer.state(
                            startGunUTC: gun,
                            countdownDurationSeconds: viewModel.countdownMinutes * 60,
                            now: timeline.date
                        )
                        countdownContent(
                            phase: state.phase,
                            width: proxy.size.width,
                            height: proxy.size.height
                        )
                        .transaction { transaction in
                            transaction.animation = nil
                        }
                    }
                } else {
                    countdownContent(
                        phase: .idle,
                        width: proxy.size.width,
                        height: proxy.size.height
                    )
                }

                if let syncMessage = viewModel.syncMessage {
                    VStack {
                        Spacer()
                        Text(syncMessage)
                            .font(LandscapeTheme.labelFont(size: 12, style: displaySettings.settings.labelFontStyle))
                            .foregroundStyle(.red)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 24)
                            .padding(.bottom, 16)
                    }
                }
            }
        }
        .persistentSystemOverlays(.hidden)
    }

    @ViewBuilder
    private func countdownContent(phase: RaceTimerPhase, width: CGFloat, height: CGFloat) -> some View {
        let timerLine = RaceTimerFormat.line(
            phase: phase,
            presetMinutes: viewModel.countdownMinutes,
            haltedRemainingSeconds: viewModel.haltedRemainingSeconds
        )

        VStack(spacing: 8) {
            Text(RaceTimerFormat.header(for: phase))
                .font(LandscapeTheme.labelFont(size: 14, style: displaySettings.settings.labelFontStyle))
                .foregroundStyle(LandscapeTheme.label)
                .tracking(2)

            Text(timerLine)
                .font(LandscapeTheme.valueFont(size: 320, style: displaySettings.settings.valueFontStyle))
                .monospacedDigit()
                .minimumScaleFactor(0.01)
                .lineLimit(1)
                .foregroundStyle(LandscapeTheme.primary)
                .frame(width: width * 0.96, height: height * 0.82)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - AP postponement (shared with PortraitRaceView)

/// ICS Answering Pennant (AP) — red / white vertical stripes, tapered fly.
struct AnsweringPennantView: View {
    var width: CGFloat = 72
    var height: CGFloat = 96

    var body: some View {
        Canvas { context, size in
            let w = size.width
            let h = size.height
            let flyInset = w * 0.22
            let path = Path { p in
                p.move(to: CGPoint(x: 0, y: 0))
                p.addLine(to: CGPoint(x: w, y: h * 0.5))
                p.addLine(to: CGPoint(x: 0, y: h))
                p.closeSubpath()
            }
            context.clip(to: path)

            let stripeCount = 5
            let stripeW = w / CGFloat(stripeCount)
            for i in 0..<stripeCount {
                let rect = CGRect(x: CGFloat(i) * stripeW, y: 0, width: stripeW + 1, height: h)
                context.fill(
                    Path(rect),
                    with: .color(i.isMultiple(of: 2) ? Color(red: 0.78, green: 0.08, blue: 0.12) : .white)
                )
            }

            var shade = Path()
            shade.move(to: CGPoint(x: w - flyInset, y: 0))
            shade.addLine(to: CGPoint(x: w, y: h * 0.5))
            shade.addLine(to: CGPoint(x: w - flyInset, y: h))
            shade.closeSubpath()
            context.fill(shade, with: .color(.black.opacity(0.06)))
        }
        .frame(width: width, height: height)
        .shadow(color: .black.opacity(0.15), radius: 2, y: 1)
        .accessibilityLabel("Answering Pennant AP")
    }
}

struct StartPostponedBanner: View {
    var compact: Bool = false

    var body: some View {
        VStack(spacing: compact ? 8 : 16) {
            AnsweringPennantView(
                width: compact ? 56 : 88,
                height: compact ? 74 : 118
            )
            Text("START POSTPONED")
                .font(.system(size: compact ? 15 : 22, weight: .bold, design: .rounded))
                .tracking(compact ? 1 : 2)
                .multilineTextAlignment(.center)
            Text("AP")
                .font(.system(size: compact ? 13 : 17, weight: .semibold, design: .rounded))
                .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Start postponed. Answering Pennant AP.")
    }
}
