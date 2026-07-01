import Foundation

enum TideSetting: String, Codable, CaseIterable, Identifiable, Sendable {
    case none
    case weak
    case tidal
    case strong

    var id: String { rawValue }

    var label: String {
        switch self {
        case .none: return "None (0 kt)"
        case .weak: return "Weak (0–2 kt)"
        case .tidal: return "Tidal (2–4 kt)"
        case .strong: return "Strong (4+ kt)"
        }
    }

    /// Upper bound of expected current band — scales COG/SOG tolerance widening.
    var currentComponentKnots: Double {
        switch self {
        case .none: return 0
        case .weak: return 2
        case .tidal: return 4
        case .strong: return 6
        }
    }
}

enum WindSetting: String, Codable, CaseIterable, Identifiable, Sendable {
    case stable
    case shifty
    case bigShiftExpected = "big_shift"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .stable: return "Stable (<10°)"
        case .shifty: return "Shifty (10–20°)"
        case .bigShiftExpected: return "Big Shift Expected"
        }
    }

    var processNoiseDegreesSquared: Double {
        switch self {
        case .stable: return 0.5
        case .shifty: return 2.0
        case .bigShiftExpected: return 4.0
        }
    }

    var clusterAgreementCount: Int {
        switch self {
        case .stable: return 4
        case .shifty: return 3
        case .bigShiftExpected: return 2
        }
    }

    var outlierRejectDegrees: Double {
        switch self {
        case .stable: return 25
        case .shifty: return 35
        case .bigShiftExpected: return 180
        }
    }
}

struct SailingConditionSettings: Codable, Equatable, Sendable {
    var tide: TideSetting = .none
    var wind: WindSetting = .stable
    var baseWindDegrees: Double?
    var expectedTackingAngle: Double = 90
}

enum SailingSettingsStore {
    private static let key = "sailing_condition_settings"

    static func load() -> SailingConditionSettings {
        guard let data = UserDefaults.standard.data(forKey: key),
              let settings = try? JSONDecoder().decode(SailingConditionSettings.self, from: data) else {
            return SailingConditionSettings()
        }
        return settings
    }

    static func save(_ settings: SailingConditionSettings) {
        guard let data = try? JSONEncoder().encode(settings) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }
}

enum VmgDisplayMode: String, Sendable {
    case upwind
    case downwind
}

struct WindEstimationSnapshot: Equatable, Sendable {
    let vmgKnots: Double?
    let displayMode: VmgDisplayMode
    let windDegrees: Double?
    let hasWind: Bool
    let windAngleDegrees: Double?
    let possibleShift: Bool
    let statusMessage: String
}
