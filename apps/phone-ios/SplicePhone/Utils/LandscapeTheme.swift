import SwiftUI

enum LandscapeTheme {
    static let background = Color.black
    static let primary = Color.yellow
    static let label = Color.yellow.opacity(0.72)
    static let muted = Color.yellow.opacity(0.45)
    static let heelPort = Color.red
    static let heelStarboard = Color.green

    static func labelFont(size: CGFloat, style: DisplayFontStyle) -> Font {
        font(size: size, style: style, weight: .heavy)
    }

    static func valueFont(size: CGFloat, style: DisplayFontStyle) -> Font {
        font(size: size, style: style, weight: .heavy)
    }

    private static func font(size: CGFloat, style: DisplayFontStyle, weight: Font.Weight) -> Font {
        switch style {
        case .systemHeavy:
            return .system(size: size, weight: .heavy, design: .default)
        case .roundedWatch:
            return .system(size: size, weight: .heavy, design: .rounded)
        case .digitalMono:
            return .system(size: size, weight: .black, design: .monospaced)
        }
    }
}
