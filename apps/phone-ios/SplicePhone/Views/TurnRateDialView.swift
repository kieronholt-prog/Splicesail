import SwiftUI

/// Turn dial hub on screen centreline — 0 at 3 o'clock; stbd up (red), port down (green).
struct TurnRateDialView: View {
    let turnDegreesPerSecond: Double
    var maxDegreesPerSecond: Double = ConnectIQConstants.turnDialMaxDegreesPerSecond
    var tickStep: Double = 5
    /// Hub X in the view's coordinate space (screen centreline when overlaid full-width).
    var hubX: CGFloat?
    var clipMinX: CGFloat?
    var labelFont: Font = .caption.weight(.heavy)
    var scaleLabelFont: Font = .caption2.weight(.bold)

    private let arcLineWidth: CGFloat = 6
    private let tickLineWidth: CGFloat = 3
    private let zeroTickLineWidth: CGFloat = 4
    private let needleLineWidth: CGFloat = 7
    private let hubRadius: CGFloat = 8
    private let labelOutset: CGFloat = 32

    var body: some View {
        GeometryReader { proxy in
            let centerX = hubX ?? (proxy.size.width / 2)
            let center = CGPoint(x: centerX, y: proxy.size.height / 2)
            let panelWidth = proxy.size.width - (clipMinX ?? 0)
            let radius = min(proxy.size.height / 2 - 24, panelWidth - 20)
            let clipX = clipMinX ?? 0

            ZStack {
                Canvas { context, size in
                    if let clipMinX {
                        context.clip(to: Path(CGRect(x: clipMinX, y: 0, width: size.width - clipMinX, height: size.height)))
                    }
                    drawZones(context: &context, center: center, radius: radius)
                    drawArc(context: &context, center: center, radius: radius)
                    drawTicks(context: &context, center: center, radius: radius)
                    drawNeedle(context: &context, center: center, radius: radius * 0.92)
                }

                ForEach(visibleTickValues, id: \.self) { tick in
                    let angle = needleAngleDegrees(tick)
                    let point = pointOnArc(center: center, radius: radius + labelOutset, angleDegrees: angle)
                    if point.x >= clipX + 8 {
                        Text(formatTickLabel(tick))
                            .font(scaleLabelFont)
                            .foregroundStyle(LandscapeTheme.label)
                            .rotationEffect(.degrees(labelRotationDegrees(angle)))
                            .position(x: point.x, y: point.y)
                    }
                }

                ForEach(endpointTicks, id: \.self) { tick in
                    let angle = needleAngleDegrees(tick)
                    let point = pointOnArc(center: center, radius: radius + labelOutset, angleDegrees: angle)
                    if point.x >= clipX + 8 {
                        Text("…")
                            .font(scaleLabelFont)
                            .foregroundStyle(LandscapeTheme.label)
                            .position(x: point.x, y: point.y)
                    }
                }
            }
        }
    }

    private var endpointTicks: [Double] {
        [-maxDegreesPerSecond, maxDegreesPerSecond]
    }

    private var visibleTickValues: [Double] {
        stride(from: -maxDegreesPerSecond, through: maxDegreesPerSecond, by: tickStep)
            .filter { abs($0) != maxDegreesPerSecond && $0 != 0 && shouldDrawTickLabel(needleAngleDegrees($0)) }
    }

    private func shouldDrawTickLabel(_ angle: Double) -> Bool {
        cos(angle * .pi / 180) > 0.25
    }

    private func drawZones(context: inout GraphicsContext, center: CGPoint, radius: CGFloat) {
        fillArcSector(context: &context, center: center, radius: radius, startDegrees: 0, endDegrees: 90, color: Color.red.opacity(0.35))
        fillArcSector(context: &context, center: center, radius: radius, startDegrees: 270, endDegrees: 360, color: Color.green.opacity(0.35))
    }

    private func fillArcSector(
        context: inout GraphicsContext,
        center: CGPoint,
        radius: CGFloat,
        startDegrees: Double,
        endDegrees: Double,
        color: Color
    ) {
        var path = Path()
        path.move(to: center)
        let steps = 16
        var span = endDegrees - startDegrees
        if span < 0 {
            span += 360
        }
        for step in 0...steps {
            var degrees = startDegrees + span * Double(step) / Double(steps)
            if degrees >= 360 {
                degrees -= 360
            }
            path.addLine(to: pointOnArc(center: center, radius: radius, angleDegrees: degrees))
        }
        path.closeSubpath()
        context.fill(path, with: .color(color))
    }

    private func drawArc(context: inout GraphicsContext, center: CGPoint, radius: CGFloat) {
        var path = Path()
        path.addArc(
            center: center,
            radius: radius,
            startAngle: .degrees(270),
            endAngle: .degrees(90),
            clockwise: true
        )
        context.stroke(path, with: .color(LandscapeTheme.label.opacity(0.8)), lineWidth: arcLineWidth)
    }

    private func drawTicks(context: inout GraphicsContext, center: CGPoint, radius: CGFloat) {
        var tick = -maxDegreesPerSecond
        while tick <= maxDegreesPerSecond + 0.01 {
            let angle = needleAngleDegrees(tick)
            let outer = pointOnArc(center: center, radius: radius, angleDegrees: angle)
            let inner = pointOnArc(center: center, radius: radius - 16, angleDegrees: angle)
            var path = Path()
            path.move(to: inner)
            path.addLine(to: outer)
            context.stroke(
                path,
                with: .color(LandscapeTheme.label),
                lineWidth: tick == 0 ? zeroTickLineWidth : tickLineWidth
            )
            tick += tickStep
        }
    }

    private func drawNeedle(context: inout GraphicsContext, center: CGPoint, radius: CGFloat) {
        let angle = needleAngleDegrees(turnDegreesPerSecond)
        let tip = pointOnArc(center: center, radius: radius, angleDegrees: angle)
        var path = Path()
        path.move(to: center)
        path.addLine(to: tip)
        context.stroke(path, with: .color(LandscapeTheme.primary), lineWidth: needleLineWidth)
        context.fill(
            Path(ellipseIn: CGRect(
                x: center.x - hubRadius,
                y: center.y - hubRadius,
                width: hubRadius * 2,
                height: hubRadius * 2
            )),
            with: .color(LandscapeTheme.primary)
        )
    }

    private func needleAngleDegrees(_ rate: Double) -> Double {
        let clamped = min(max(rate, -maxDegreesPerSecond), maxDegreesPerSecond)
        let norm = clamped / maxDegreesPerSecond
        if norm >= 0 {
            return 360 - norm * 90
        }
        return -norm * 90
    }

    private func labelRotationDegrees(_ angle: Double) -> Double {
        90 - angle
    }

    private func pointOnArc(center: CGPoint, radius: CGFloat, angleDegrees: Double) -> CGPoint {
        let radians = angleDegrees * .pi / 180
        return CGPoint(
            x: center.x + radius * CGFloat(cos(radians)),
            y: center.y - radius * CGFloat(sin(radians))
        )
    }

    private func formatTickLabel(_ tick: Double) -> String {
        let value = abs(tick.rounded())
        return String(format: "%.0f", value)
    }
}
