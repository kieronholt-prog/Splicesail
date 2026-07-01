import Foundation

enum CircularHeading {
    static func normalize(_ degrees: Double) -> Double {
        HeadingNormalizer.normaliseHeading(degrees)
    }

    /// Smallest absolute angle between two headings (0–180°).
    static func angleBetween(_ a: Double, _ b: Double) -> Double {
        var delta = (b - a).truncatingRemainder(dividingBy: 360)
        if delta < 0 { delta += 360 }
        if delta > 180 { delta = 360 - delta }
        return delta
    }

    /// Signed angle from `from` to `to` (−180…+180, + = clockwise).
    static func signedAngle(from: Double, to: Double) -> Double {
        var delta = (to - from).truncatingRemainder(dividingBy: 360)
        if delta < 0 { delta += 360 }
        if delta > 180 { delta -= 360 }
        return delta
    }

    /// Circular mean of headings in degrees.
    static func mean(_ headings: [Double]) -> Double? {
        guard !headings.isEmpty else { return nil }
        var sumSin = 0.0
        var sumCos = 0.0
        for heading in headings {
            let radians = heading * .pi / 180
            sumSin += sin(radians)
            sumCos += cos(radians)
        }
        guard sumSin != 0 || sumCos != 0 else { return nil }
        return normalize(atan2(sumSin, sumCos) * 180 / .pi)
    }

    /// True-wind direction (wind FROM) from two opposite-tack headings.
    static func windFromTackHeadings(_ h1: Double, _ h2: Double) -> Double {
        let delta = signedAngle(from: h1, to: h2)
        return normalize(h1 + delta / 2)
    }

    /// VMG along wind axis: positive = upwind component, negative = downwind.
    static func vmgKnots(sog: Double, heading: Double, windFrom: Double) -> Double {
        guard sog > 0 else { return 0 }
        let rel = angleBetween(heading, windFrom)
        return sog * cos(rel * .pi / 180)
    }

    static func onOppositeSidesOfWind(_ h1: Double, _ h2: Double, windFrom: Double) -> Bool {
        let a1 = signedAngle(from: windFrom, to: h1)
        let a2 = signedAngle(from: windFrom, to: h2)
        if abs(a1) < 0.5 || abs(a2) < 0.5 { return false }
        return (a1 > 0) != (a2 > 0)
    }

    /// True when heading is above true-wind perpendicular (upwind hemisphere).
    static func isUpwindHemisphere(heading: Double, windFrom: Double) -> Bool {
        let rel = signedAngle(from: windFrom, to: heading)
        return abs(rel) < 90
    }
}
