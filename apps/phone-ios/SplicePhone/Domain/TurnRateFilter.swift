import Foundation

/// Tunable EMA parameters — thresholds in °/s (calibrate on water).
enum TurnRateFilterConfig {
    static let alphaSlow = 0.08
    static let alphaFast = 0.5
    /// Steady-course noise band (°/s).
    static let noiseFloorDegreesPerSecond = 0.05
    /// Maneuver band (°/s) — ~30°/min.
    static let maneuverThresholdDegreesPerSecond = 0.5
}

struct FilteredTurnRate: Equatable, Sendable {
    let degreesPerSecond: Double
}

/// Adaptive EMA on turn rate (°/s). Updated every motion sample; time-normalized alpha.
struct TurnRateFilter {
    private var filteredRate = 0.0
    private var hasFiltered = false
    private var lastHeading: Double?
    private var lastTime: Date?

    mutating func reset() {
        filteredRate = 0
        hasFiltered = false
        lastHeading = nil
        lastTime = nil
    }

    var filteredTurnRateDegreesPerSecond: Double {
        filteredRate
    }

    @discardableResult
    mutating func update(headingDegrees: Double, timestamp: Date = Date()) -> FilteredTurnRate {
        defer {
            lastHeading = headingDegrees
            lastTime = timestamp
        }

        guard let lastHeading, let lastTime else {
            return FilteredTurnRate(degreesPerSecond: 0)
        }

        let deltaTime = timestamp.timeIntervalSince(lastTime)
        guard deltaTime > 0 else {
            return FilteredTurnRate(degreesPerSecond: filteredRate)
        }

        var delta = headingDegrees - lastHeading
        if delta > 180 { delta -= 360 }
        if delta < -180 { delta += 360 }

        let rateInstant = delta / deltaTime
        let alpha = effectiveAlpha(
            base: blendedAlpha(delta: abs(rateInstant - filteredRate)),
            dt: deltaTime
        )

        if !hasFiltered {
            filteredRate = rateInstant
            hasFiltered = true
        } else {
            filteredRate = alpha * rateInstant + (1 - alpha) * filteredRate
        }

        return FilteredTurnRate(degreesPerSecond: filteredRate)
    }

    private func blendedAlpha(delta: Double) -> Double {
        let floor = TurnRateFilterConfig.noiseFloorDegreesPerSecond
        let ceiling = TurnRateFilterConfig.maneuverThresholdDegreesPerSecond
        if delta <= floor {
            return TurnRateFilterConfig.alphaSlow
        }
        if delta >= ceiling {
            return TurnRateFilterConfig.alphaFast
        }
        let blend = (delta - floor) / (ceiling - floor)
        return TurnRateFilterConfig.alphaSlow
            + blend * (TurnRateFilterConfig.alphaFast - TurnRateFilterConfig.alphaSlow)
    }

    /// Keeps alpha_slow / alpha_fast meaningful when dt varies (60 Hz motion vs 4 Hz reference).
    private func effectiveAlpha(base: Double, dt: TimeInterval) -> Double {
        let referenceDt = 1.0 / Double(ConnectIQConstants.compassTransmitHertz)
        guard referenceDt > 0, dt > 0 else {
            return base
        }
        return 1 - pow(1 - base, dt / referenceDt)
    }
}
