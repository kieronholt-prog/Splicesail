import SwiftUI

/// Port (red, left) / starboard (green, right) heel bar with graduations and 5 s trail.
struct HeelBarView: View {
    let heelDegrees: Double
    let minHeel: Double?
    let maxHeel: Double?

    var body: some View {
        GeometryReader { proxy in
            let width = proxy.size.width
            let height = proxy.size.height
            let barHeight = height * 0.38
            let bubbleSize = min(height * 0.72, 28)
            let bubbleX = HeelBarLayout.normalizedPosition(for: heelDegrees) * width
            let trail = HeelBarLayout.trailSpan(
                heelDegrees: heelDegrees,
                minHeel: minHeel,
                maxHeel: maxHeel,
                barWidth: width,
                minimumWidth: bubbleSize
            )

            VStack(spacing: 2) {
                HStack {
                    Text("P")
                        .font(.system(size: 11, weight: .heavy, design: .rounded))
                        .foregroundStyle(LandscapeTheme.heelPort)
                    Spacer()
                    Text(String(format: "%+.0f°", heelDegrees))
                        .font(.system(size: 11, weight: .heavy, design: .rounded))
                        .foregroundStyle(LandscapeTheme.primary)
                        .monospacedDigit()
                    Spacer()
                    Text("S")
                        .font(.system(size: 11, weight: .heavy, design: .rounded))
                        .foregroundStyle(LandscapeTheme.heelStarboard)
                }
                .padding(.horizontal, 2)

                ZStack {
                    HStack(spacing: 0) {
                        LandscapeTheme.heelPort
                        LandscapeTheme.heelStarboard
                    }
                    .frame(width: width, height: barHeight)
                    .clipShape(RoundedRectangle(cornerRadius: 6))

                    Capsule()
                        .fill(Color.black.opacity(0.88))
                        .frame(width: trail.width, height: barHeight)
                        .position(x: trail.centerX, y: barHeight / 2)

                    ForEach(HeelBarLayout.graduationPositions(), id: \.degrees) { mark in
                        graduationTick(
                            at: mark.position * width,
                            barHeight: barHeight,
                            label: mark.degrees
                        )
                    }

                    Circle()
                        .fill(LandscapeTheme.primary)
                        .frame(width: bubbleSize, height: bubbleSize)
                        .overlay {
                            Circle().stroke(Color.black.opacity(0.35), lineWidth: 1)
                        }
                        .position(x: bubbleX, y: barHeight / 2)
                }
                .frame(width: width, height: barHeight)
            }
            .frame(maxHeight: .infinity, alignment: .center)
        }
    }

    @ViewBuilder
    private func graduationTick(at x: CGFloat, barHeight: CGFloat, label: Double) -> some View {
        let isCenter = abs(label) < 0.01
        let tickHeight = isCenter ? barHeight * 0.95 : barHeight * 0.55

        VStack(spacing: 1) {
            Rectangle()
                .fill(Color.black.opacity(isCenter ? 0.9 : 0.65))
                .frame(width: isCenter ? 2 : 1, height: tickHeight)
            if !isCenter {
                Text("\(Int(abs(label).rounded()))")
                    .font(.system(size: 8, weight: .bold, design: .rounded))
                    .foregroundStyle(Color.black.opacity(0.85))
                    .monospacedDigit()
            }
        }
        .position(x: x, y: barHeight * 0.42)
    }
}
