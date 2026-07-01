import CoreMotion
import Foundation

final class MotionService: MotionConnectable {
    private let motionManager = CMMotionManager()
    private var continuation: AsyncStream<MotionSample>.Continuation?

    private static let updateInterval = 1.0 / 60.0
    private static let radiansToDegrees = 180.0 / .pi

    private let motionQueue: OperationQueue = {
        let queue = OperationQueue()
        queue.name = "com.compassbox.splicephone.motion"
        queue.maxConcurrentOperationCount = 1
        return queue
    }()

    lazy var sampleStream: AsyncStream<MotionSample> = {
        AsyncStream(bufferingPolicy: .bufferingNewest(1)) { continuation in
            self.continuation = continuation
        }
    }()

    func start() async {
        guard motionManager.isDeviceMotionAvailable else {
            return
        }

        motionManager.deviceMotionUpdateInterval = Self.updateInterval
        motionManager.startDeviceMotionUpdates(
            using: .xMagneticNorthZVertical,
            to: motionQueue
        ) { [weak self] motion, _ in
            guard let self, let motion else {
                return
            }
            self.publishSample(from: motion)
        }
    }

    func stop() async {
        motionManager.stopDeviceMotionUpdates()
        continuation?.finish()
        continuation = nil
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

    private func publishSample(from motion: CMDeviceMotion) {
        let attitude = motion.attitude
        let yawDeg = attitude.yaw * Self.radiansToDegrees
        let pitchDeg = attitude.pitch * Self.radiansToDegrees
        let rollDeg = attitude.roll * Self.radiansToDegrees

        let isLandscape = LandscapeCompass.isLandscape(rollDeg: rollDeg)
        let side = isLandscape ? LandscapeCompass.side(rollDeg: rollDeg) : nil
        let heading = LandscapeCompass.heading(yawDeg: yawDeg, rollDeg: rollDeg)

        let gravity = motion.gravity
        let rawAttitude = LandscapeCompass.attitude(
            pitchDeg: pitchDeg,
            rollDeg: rollDeg,
            gravityX: gravity.x,
            gravityY: gravity.y,
            gravityZ: gravity.z
        )

        let rawTrim: Double
        if let side, let rawAttitude {
            if AttitudeZeroStore.hasTrimOffset {
                rawTrim = rawAttitude.trim
            } else {
                rawTrim = LandscapeCompass.eulerLandscapeTrim(rollDeg: rollDeg, side: side)
            }
        } else {
            rawTrim = 0
        }

        let fineHeel = (rawAttitude?.heel ?? 0) - AttitudeZeroStore.heelOffset
        let fineTrim = rawTrim - AttitudeZeroStore.trimOffset
        let heel = Int(fineHeel.rounded())
        let trim = Int(fineTrim.rounded())

        let sample = MotionSample(
            headingDegrees: heading,
            heelDegrees: heel,
            trimDegrees: trim,
            fineHeelDegrees: fineHeel,
            fineTrimDegrees: fineTrim,
            isLandscapePose: isLandscape,
            landscapeSide: side,
            rawYawDegrees: yawDeg,
            rawPitchDegrees: pitchDeg,
            rawRollDegrees: rollDeg,
            rawGravityX: gravity.x,
            rawGravityY: gravity.y,
            rawGravityZ: gravity.z
        )

        continuation?.yield(sample)
    }
}
