import Foundation

enum DisplayTier: String, Codable, CaseIterable, Identifiable, Sendable {
    case core
    case pro
    case proPlus = "pro_plus"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .core:
            return "Core"
        case .pro:
            return "Pro"
        case .proPlus:
            return "Pro+"
        }
    }

    var detail: String {
        switch self {
        case .core:
            return "Timer & Heading"
        case .pro:
            return "Core + SOG"
        case .proPlus:
            return "Pro + phone VMG"
        }
    }

    var allowsSog: Bool {
        self == .pro || self == .proPlus
    }

    var allowsVmg: Bool {
        self == .proPlus
    }
}

enum DisplayFontStyle: String, Codable, CaseIterable, Identifiable {
    case systemHeavy
    case roundedWatch
    case digitalMono

    var id: String { rawValue }

    var label: String {
        switch self {
        case .systemHeavy:
            return "System Heavy"
        case .roundedWatch:
            return "Watch (Rounded)"
        case .digitalMono:
            return "Digital LCD"
        }
    }
}

struct DisplaySettings: Codable, Equatable {
    var displayTier: DisplayTier = .core
    var defaultBrightness: Double = 0.5
    var countdownBrightness: Double = 0.5
    var boostBrightness: Double = 1.0
    var boostDurationSeconds: Int = 30
    var labelFontStyle: DisplayFontStyle = .roundedWatch
    var valueFontStyle: DisplayFontStyle = .digitalMono

    enum CodingKeys: String, CodingKey {
        case displayTier
        case defaultBrightness
        case countdownBrightness
        case boostBrightness
        case boostDurationSeconds
        case labelFontStyle
        case valueFontStyle
        case labelWeight
        case valueWeight
    }

    init() {}

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        displayTier = try container.decodeIfPresent(DisplayTier.self, forKey: .displayTier) ?? .core
        defaultBrightness = try container.decodeIfPresent(Double.self, forKey: .defaultBrightness) ?? 0.5
        countdownBrightness = try container.decodeIfPresent(Double.self, forKey: .countdownBrightness) ?? 0.5
        boostBrightness = try container.decodeIfPresent(Double.self, forKey: .boostBrightness) ?? 1.0
        boostDurationSeconds = try container.decodeIfPresent(Int.self, forKey: .boostDurationSeconds) ?? 30
        labelFontStyle = try container.decodeIfPresent(DisplayFontStyle.self, forKey: .labelFontStyle) ?? .roundedWatch
        valueFontStyle = try container.decodeIfPresent(DisplayFontStyle.self, forKey: .valueFontStyle) ?? .digitalMono
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(displayTier, forKey: .displayTier)
        try container.encode(defaultBrightness, forKey: .defaultBrightness)
        try container.encode(countdownBrightness, forKey: .countdownBrightness)
        try container.encode(boostBrightness, forKey: .boostBrightness)
        try container.encode(boostDurationSeconds, forKey: .boostDurationSeconds)
        try container.encode(labelFontStyle, forKey: .labelFontStyle)
        try container.encode(valueFontStyle, forKey: .valueFontStyle)
    }
}

enum DisplaySettingsStore {
    private static let key = "splice_phone.display_settings"

    static func load() -> DisplaySettings {
        guard let data = UserDefaults.standard.data(forKey: key),
              let settings = try? JSONDecoder().decode(DisplaySettings.self, from: data) else {
            return DisplaySettings()
        }
        return settings
    }

    static func save(_ settings: DisplaySettings) {
        guard let data = try? JSONEncoder().encode(settings) else {
            return
        }
        UserDefaults.standard.set(data, forKey: key)
    }
}
