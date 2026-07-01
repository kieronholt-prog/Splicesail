import SwiftUI

/// Shared horizontal layout for the trim panel (bars + labels + header).
struct TrimBarMetrics {
    let gap: CGFloat
    let labelWidth: CGFloat
    let barWidth: CGFloat
    let labelX: CGFloat
    let barCenterX: CGFloat
    let headerX: CGFloat

    init(panelWidth: CGFloat) {
        gap = max(panelWidth * 0.05, 12)
        labelWidth = 22
        barWidth = min(panelWidth * 0.44, 128)
        let labelTrailing = panelWidth - gap
        labelX = labelTrailing - labelWidth / 2
        let barTrailing = labelTrailing - gap - labelWidth
        barCenterX = barTrailing - barWidth / 2
        headerX = barCenterX
    }
}

/// Vertical trim bar — 0 centreline, up above, down below (2° steps, max 10°).
struct TrimBarView: View {
    let trimDegrees: Int
    var maxTrimDegrees: Double = 10
    var stepDegrees: Double = 2
    var labelFont: Font = .caption.weight(.heavy)

    private var segmentCount: Int {
        Int(maxTrimDegrees / stepDegrees)
    }

    var body: some View {
        GeometryReader { proxy in
            let layout = TrimBarMetrics(panelWidth: proxy.size.width)
            let cy = proxy.size.height / 2
            let topMargin: CGFloat = 34
            let bottomMargin: CGFloat = 28
            let centerGap: CGFloat = 8
            let usableHeight = proxy.size.height - topMargin - bottomMargin - centerGap
            let segmentHeight = usableHeight / CGFloat(segmentCount * 2)

            ZStack {
                ForEach(1...segmentCount, id: \.self) { index in
                    let threshold = Int(stepDegrees) * index
                    let upY = cy - centerGap / 2 - CGFloat(index) * segmentHeight
                    let downY = cy + centerGap / 2 + CGFloat(index) * segmentHeight

                    Text("\(threshold)")
                        .font(labelFont)
                        .foregroundStyle(LandscapeTheme.label)
                        .frame(width: layout.labelWidth, alignment: .trailing)
                        .position(x: layout.labelX, y: upY)

                    Text("\(threshold)")
                        .font(labelFont)
                        .foregroundStyle(LandscapeTheme.label)
                        .frame(width: layout.labelWidth, alignment: .trailing)
                        .position(x: layout.labelX, y: downY)

                    Path { path in
                        path.move(to: CGPoint(x: layout.barCenterX - layout.barWidth / 2, y: upY))
                        path.addLine(to: CGPoint(x: layout.barCenterX + layout.barWidth / 2, y: upY))
                        path.move(to: CGPoint(x: layout.barCenterX - layout.barWidth / 2, y: downY))
                        path.addLine(to: CGPoint(x: layout.barCenterX + layout.barWidth / 2, y: downY))
                    }
                    .stroke(LandscapeTheme.label, lineWidth: 2)

                    if trimDegrees >= threshold {
                        RoundedRectangle(cornerRadius: 2)
                            .fill(LandscapeTheme.primary)
                            .frame(width: layout.barWidth, height: max(segmentHeight - 3, 5))
                            .position(x: layout.barCenterX, y: upY - segmentHeight / 2)
                    }
                    if trimDegrees <= -threshold {
                        RoundedRectangle(cornerRadius: 2)
                            .fill(LandscapeTheme.primary)
                            .frame(width: layout.barWidth, height: max(segmentHeight - 3, 5))
                            .position(x: layout.barCenterX, y: downY + segmentHeight / 2)
                    }
                }
            }
        }
    }
}
