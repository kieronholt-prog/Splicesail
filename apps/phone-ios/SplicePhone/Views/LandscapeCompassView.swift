import SwiftUI

/// Landscape racing compass — raw sensor values only.
struct LandscapeCompassView: View {
    let sample: AttitudeSample?
    let linkStatusLabel: String

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                Color.black.ignoresSafeArea()

                if let sample, sample.isLandscapePose, let heading = sample.headingDegrees {
                    HStack(spacing: 24) {
                        compassTile(title: "Heading", value: "\(heading)°", width: proxy.size.width)
                        compassTile(title: "Heel", value: formatHeel(sample.displayHeelDegreesInt), width: proxy.size.width)
                        compassTile(title: "Trim", value: formatTrim(sample.trimDegrees), width: proxy.size.width)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .transaction { transaction in
                        transaction.animation = nil
                    }
                } else if let sample, sample.isLandscapePose {
                    VStack(spacing: 16) {
                        Text("Waiting for heading…")
                            .font(.title2.weight(.semibold))
                        Text("Heel \(formatHeel(sample.displayHeelDegreesInt)) · Trim \(formatTrim(sample.trimDegrees))")
                            .font(.title3)
                            .foregroundStyle(.secondary)
                    }
                    .foregroundStyle(.white)
                } else {
                    VStack(spacing: 16) {
                        Image(systemName: "iphone.landscape")
                            .font(.system(size: 48))
                        Text("Mount phone in landscape bracket")
                            .font(.title2.weight(.semibold))
                        Text("Heading uses raw yaw when the phone roll is ≈ ±90° (on its side in the mount), not when held flat.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                        if let sample {
                            Text("Roll \(Int(sample.rawRollDegrees.rounded()))° · yaw \(Int(sample.rawYawDegrees.rounded()))°")
                                .font(.caption.monospacedDigit())
                                .foregroundStyle(.tertiary)
                        }
                    }
                    .foregroundStyle(.white)
                }

                VStack {
                    Spacer()
                    Text(linkStatusLabel)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .padding(.bottom, 12)
                }
            }
        }
        .persistentSystemOverlays(.hidden)
    }

    private func compassTile(title: String, value: String, width: CGFloat) -> some View {
        VStack(spacing: 8) {
            Text(title)
                .font(.title3)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.system(size: min(width * 0.12, 72), weight: .bold, design: .rounded))
                .monospacedDigit()
        }
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity)
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

#Preview {
    LandscapeCompassView(
        sample: AttitudeSample(
            headingDegrees: 273,
            heelDegrees: 8,
            trimDegrees: -3,
            fineHeelDegrees: 8,
            fineTrimDegrees: -3,
            turnDegreesPerSecond: 0.2,
            publishTimestamp: Date().timeIntervalSince1970,
            isLandscapePose: true,
            landscapeSide: .right,
            rawYawDegrees: -273,
            rawPitchDegrees: -8,
            rawRollDegrees: -93,
            rawGravityX: 0.139,
            rawGravityY: 0,
            rawGravityZ: -0.990
        ),
        linkStatusLabel: "Connected via Connect IQ"
    )
    .previewInterfaceOrientation(.landscapeRight)
}
