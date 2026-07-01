import Foundation

/// Single-state circular Kalman filter for wind direction (degrees true, wind FROM).
struct WindKalmanFilter {
    private(set) var windDegrees: Double?
    private(set) var variance: Double = 400

    mutating func reset(windDegrees: Double, variance: Double = 25) {
        self.windDegrees = CircularHeading.normalize(windDegrees)
        self.variance = variance
    }

    mutating func predict(processNoise: Double) {
        variance += processNoise
    }

    /// Kalman update with measurement noise R (degrees²). Never hard-rejects.
    mutating func update(measurement: Double, measurementNoise: Double) {
        let z = CircularHeading.normalize(measurement)
        guard let x = windDegrees else {
            windDegrees = z
            variance = measurementNoise
            return
        }

        let innovation = CircularHeading.signedAngle(from: x, to: z)
        let r = max(measurementNoise, 1)
        let kalmanGain = variance / (variance + r)
        windDegrees = CircularHeading.normalize(x + kalmanGain * innovation)
        variance = (1 - kalmanGain) * variance
    }

    func innovationDegrees(to measurement: Double) -> Double {
        guard let x = windDegrees else { return 0 }
        return CircularHeading.signedAngle(from: x, to: measurement)
    }
}
