import Foundation

@MainActor
final class MockMotionService: MotionConnectable {
    private var continuation: AsyncStream<MotionSample>.Continuation?

    lazy var sampleStream: AsyncStream<MotionSample> = {
        AsyncStream { continuation in
            self.continuation = continuation
        }
    }()

    func start() async {
        let heelRad = 5.0 * .pi / 180.0
        continuation?.yield(
            MotionSample(
                headingDegrees: 42,
                heelDegrees: 5,
                trimDegrees: -2,
                fineHeelDegrees: 5,
                fineTrimDegrees: -2,
                isLandscapePose: true,
                landscapeSide: .right,
                rawYawDegrees: -42,
                rawPitchDegrees: -5,
                rawRollDegrees: -92,
                rawGravityX: sin(heelRad),
                rawGravityY: 0,
                rawGravityZ: -cos(heelRad)
            )
        )
    }

    func stop() async {
        continuation?.finish()
    }

    func zeroHeel(at sample: AttitudeSample) {
        AttitudeZeroStore.heelOffset += sample.fineHeelDegrees
    }

    func zeroTrim(at sample: AttitudeSample) {
        guard let side = sample.landscapeSide else {
            return
        }
        let gravityTrim = LandscapeCompass.gravityLandscapeTrim(
            gravityX: sample.rawGravityX,
            gravityY: sample.rawGravityY,
            gravityZ: sample.rawGravityZ,
            side: side
        )
        AttitudeZeroStore.trimOffset = gravityTrim
    }

    func clearZeroOffsets() {
        AttitudeZeroStore.reset()
    }
}
