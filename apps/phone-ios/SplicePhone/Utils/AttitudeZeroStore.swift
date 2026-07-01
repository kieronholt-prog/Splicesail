import Foundation

enum AttitudeZeroStore {
    private static let heelKey = "splice_phone.heel_zero"
    private static let trimKey = "splice_phone.trim_zero"

    static var heelOffset: Double {
        get { UserDefaults.standard.double(forKey: heelKey) }
        set { UserDefaults.standard.set(newValue, forKey: heelKey) }
    }

    static var trimOffset: Double {
        get { UserDefaults.standard.double(forKey: trimKey) }
        set { UserDefaults.standard.set(newValue, forKey: trimKey) }
    }

    static func reset() {
        heelOffset = 0
        trimOffset = 0
    }

    static var hasHeelOffset: Bool {
        abs(heelOffset) > 0.001
    }

    static var hasTrimOffset: Bool {
        abs(trimOffset) > 0.001
    }
}
