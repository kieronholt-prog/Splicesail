import Foundation

enum LandscapeSide: Sendable {
    case left
    case right
}

/// Landscape-only heading from raw device-motion yaw.
/// Source: compass_test_ios CompassViewModel — landscape branches only.
enum LandscapeCompass {
    static let rollThreshold = 45.0

    static func isLandscape(rollDeg: Double) -> Bool {
        abs(abs(rollDeg) - 90) < rollThreshold
    }

    /// Portrait — screen facing crew (trim zero pose).
    static func isFaceVertical(rollDeg: Double) -> Bool {
        abs(rollDeg) < rollThreshold
    }

    static func faceVerticalTrim(
        pitchDeg: Double,
        rollDeg: Double,
        gravityX: Double,
        gravityY: Double,
        gravityZ: Double
    ) -> Double? {
        guard isFaceVertical(rollDeg: rollDeg) else {
            return nil
        }
        return -pitchDeg
    }

    static func side(rollDeg: Double) -> LandscapeSide {
        rollDeg > 0 ? .left : .right
    }

    static func heading(yawDeg: Double, rollDeg: Double) -> Double? {
        guard isLandscape(rollDeg: rollDeg) else {
            return nil
        }
        return heading(yawDeg: yawDeg, side: side(rollDeg: rollDeg))
    }

    static func heading(yawDeg: Double, side: LandscapeSide) -> Double {
        let raw = side == .left ? (180 - yawDeg) : (-yawDeg)
        return HeadingNormalizer.normaliseHeading(raw)
    }

    /// Default landscape trim — 0° when the screen is vertical in the bracket (roll ≈ ±90°).
    /// Matches compass_test_ios landscape pitch remap; used until the sailor applies Zero trim.
    static func eulerLandscapeTrim(rollDeg: Double, side: LandscapeSide) -> Double {
        switch side {
        case .left:
            return 90 - rollDeg
        case .right:
            return rollDeg + 90
        }
    }

    /// Bow trim from gravity (fore-aft axis). Used after manual Zero trim is applied.
    static func gravityLandscapeTrim(
        gravityX: Double,
        gravityY: Double,
        gravityZ: Double,
        side: LandscapeSide
    ) -> Double {
        let yz = sqrt(gravityY * gravityY + gravityZ * gravityZ)
        switch side {
        case .left:
            return -atan2(gravityX, yz) * 180.0 / .pi
        case .right:
            return atan2(gravityX, yz) * 180.0 / .pi
        }
    }

    /// Heel and trim in landscape mount pose (before user zeroing).
    ///
    /// Heel uses lateral gravity (Y vs XZ). `trim` is gravity-based bow axis (use with manual zero offset).
    static func attitude(
        pitchDeg: Double,
        rollDeg: Double,
        gravityX: Double,
        gravityY: Double,
        gravityZ: Double
    ) -> (heel: Double, trim: Double)? {
        guard isLandscape(rollDeg: rollDeg) else {
            return nil
        }
        let xz = sqrt(gravityX * gravityX + gravityZ * gravityZ)
        let mountSide = side(rollDeg: rollDeg)
        let heel: Double
        switch mountSide {
        case .left:
            heel = atan2(gravityY, xz) * 180.0 / .pi
        case .right:
            heel = -atan2(gravityY, xz) * 180.0 / .pi
        }
        let trim = gravityLandscapeTrim(
            gravityX: gravityX,
            gravityY: gravityY,
            gravityZ: gravityZ,
            side: mountSide
        )
        return (heel: heel, trim: trim)
    }
}
