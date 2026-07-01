import Foundation

struct AttitudePublisherResult: Sendable {
    /// ~60 Hz — drives phone UI (heel bar, trim, turn dial).
    let display: AttitudeSample
    /// 2 Hz steady; also emits when integer heading changes.
    let transmit: AttitudeSample?
}

/// Motion → display @ sensor rate; heading decimated to 10 Hz; transmit @ 2 Hz or on heading change.
struct AttitudePublisher {
    private var turnFilter = TurnRateFilter()
    private var lastTransmitTick: TimeInterval?
    private var lastHeadingDisplayTick: TimeInterval?
    private var lastTransmittedHeading: Int?
    private var displayedHeadingDegrees: Int?

    private static let transmitInterval = 1.0 / Double(ConnectIQConstants.compassTransmitHertz)
    private static let headingDisplayInterval = 1.0 / Double(ConnectIQConstants.headingDisplayHertz)

    mutating func reset() {
        turnFilter.reset()
        lastTransmitTick = nil
        lastHeadingDisplayTick = nil
        lastTransmittedHeading = nil
        displayedHeadingDegrees = nil
    }

    mutating func ingest(_ motion: MotionSample, now: Date = Date()) -> AttitudePublisherResult {
        let timestamp = now.timeIntervalSince1970

        if let heading = motion.headingDegrees {
            _ = turnFilter.update(headingDegrees: heading, timestamp: now)
        } else {
            turnFilter.reset()
            displayedHeadingDegrees = nil
        }

        let headingForDisplay: Int?
        if let heading = motion.headingDegrees {
            if lastHeadingDisplayTick == nil || timestamp - lastHeadingDisplayTick! >= Self.headingDisplayInterval {
                displayedHeadingDegrees = Int(heading.rounded())
                lastHeadingDisplayTick = timestamp
            }
            headingForDisplay = displayedHeadingDegrees
        } else {
            displayedHeadingDegrees = nil
            headingForDisplay = nil
        }

        let turnDps = turnFilter.filteredTurnRateDegreesPerSecond
        let sample = makeSample(
            from: motion,
            headingDegrees: headingForDisplay,
            turnDps: turnDps,
            timestamp: timestamp
        )

        var transmit: AttitudeSample?
        let transmitHeading = motion.headingDegrees.map { Int($0.rounded()) } ?? headingForDisplay
        let headingChanged = transmitHeading != lastTransmittedHeading
        if headingChanged || shouldTransmit(now: timestamp) {
            lastTransmitTick = timestamp
            if headingChanged {
                lastTransmittedHeading = transmitHeading
            }
            transmit = makeSample(
                from: motion,
                headingDegrees: transmitHeading,
                turnDps: turnDps,
                timestamp: timestamp
            )
        }

        return AttitudePublisherResult(display: sample, transmit: transmit)
    }

    private func makeSample(
        from motion: MotionSample,
        headingDegrees: Int?,
        turnDps: Double,
        timestamp: TimeInterval
    ) -> AttitudeSample {
        AttitudeSample(
            headingDegrees: headingDegrees,
            heelDegrees: motion.heelDegrees,
            trimDegrees: motion.trimDegrees,
            fineHeelDegrees: motion.fineHeelDegrees,
            fineTrimDegrees: motion.fineTrimDegrees,
            turnDegreesPerSecond: turnDps,
            publishTimestamp: timestamp,
            isLandscapePose: motion.isLandscapePose,
            landscapeSide: motion.landscapeSide,
            rawYawDegrees: motion.rawYawDegrees,
            rawPitchDegrees: motion.rawPitchDegrees,
            rawRollDegrees: motion.rawRollDegrees,
            rawGravityX: motion.rawGravityX,
            rawGravityY: motion.rawGravityY,
            rawGravityZ: motion.rawGravityZ
        )
    }

    private func shouldTransmit(now: TimeInterval) -> Bool {
        guard let lastTransmitTick else {
            return true
        }
        return now - lastTransmitTick >= Self.transmitInterval
    }
}

/// Raw motion sample before filtering.
struct MotionSample: Equatable, Sendable {
    let headingDegrees: Double?
    let heelDegrees: Int
    let trimDegrees: Int
    let fineHeelDegrees: Double
    let fineTrimDegrees: Double
    let isLandscapePose: Bool
    let landscapeSide: LandscapeSide?
    let rawYawDegrees: Double
    let rawPitchDegrees: Double
    let rawRollDegrees: Double
    let rawGravityX: Double
    let rawGravityY: Double
    let rawGravityZ: Double
}
