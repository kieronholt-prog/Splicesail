import XCTest
@testable import SplicePhone

final class LandscapeCompassTests: XCTestCase {
    func testLeftLandscapeNorth() {
        let heading = LandscapeCompass.heading(yawDeg: 180, side: .left)
        XCTAssertEqual(heading, 0, accuracy: 0.01)
    }

    func testRightLandscapeNorth() {
        let heading = LandscapeCompass.heading(yawDeg: 0, side: .right)
        XCTAssertEqual(heading, 0, accuracy: 0.01)
    }

    func testNotLandscapeReturnsNil() {
        let heading = LandscapeCompass.heading(yawDeg: 0, rollDeg: 0)
        XCTAssertNil(heading)
    }

    func testHeelFromGravityLevel() {
        let attitude = LandscapeCompass.attitude(
            pitchDeg: 15,
            rollDeg: 90,
            gravityX: 0,
            gravityY: 0,
            gravityZ: -1
        )
        XCTAssertEqual(attitude?.heel, 0, accuracy: 0.1)
    }

    func testHeelFromGravityPort() {
        let heelRad = 8.0 * .pi / 180.0
        let attitude = LandscapeCompass.attitude(
            pitchDeg: 0,
            rollDeg: 90,
            gravityX: 0,
            gravityY: sin(heelRad),
            gravityZ: -cos(heelRad)
        )
        XCTAssertEqual(attitude?.heel, 8, accuracy: 0.2)
    }

    func testHeelFromGravityStarboard() {
        let heelRad = 8.0 * .pi / 180.0
        let attitude = LandscapeCompass.attitude(
            pitchDeg: 0,
            rollDeg: 90,
            gravityX: 0,
            gravityY: -sin(heelRad),
            gravityZ: -cos(heelRad)
        )
        XCTAssertEqual(attitude?.heel, -8, accuracy: 0.2)
    }

    func testHeelFromGravityRespondsBelowFifteen() {
        let heelRad = 3.0 * .pi / 180.0
        let attitude = LandscapeCompass.attitude(
            pitchDeg: 15,
            rollDeg: 90,
            gravityX: 0,
            gravityY: sin(heelRad),
            gravityZ: -cos(heelRad)
        )
        XCTAssertEqual(attitude?.heel, 3, accuracy: 0.2)
    }

    func testEulerLandscapeTrimLevelAtScreenVertical() {
        XCTAssertEqual(
            LandscapeCompass.eulerLandscapeTrim(rollDeg: 90, side: .left),
            0,
            accuracy: 0.01
        )
        XCTAssertEqual(
            LandscapeCompass.eulerLandscapeTrim(rollDeg: -90, side: .right),
            0,
            accuracy: 0.01
        )
    }

    func testPitchHeelDoesNotAffectTrim() {
        let heelRad = 8.0 * .pi / 180.0
        let attitude = LandscapeCompass.attitude(
            pitchDeg: 12,
            rollDeg: 90,
            gravityX: 0,
            gravityY: sin(heelRad),
            gravityZ: -cos(heelRad)
        )
        XCTAssertEqual(attitude?.heel, 8, accuracy: 0.2)
        XCTAssertEqual(attitude?.trim, 0, accuracy: 0.2)
    }

    func testHeelDecoupledFromTrim() {
        let trimRad = 10.0 * .pi / 180.0
        let trim = LandscapeCompass.gravityLandscapeTrim(
            gravityX: -sin(trimRad),
            gravityY: 0,
            gravityZ: -cos(trimRad),
            side: .left
        )
        XCTAssertEqual(trim, 10, accuracy: 0.3)
    }

    func testTrimBowUpLandscapeLeftEulerDefault() {
        let attitude = LandscapeCompass.eulerLandscapeTrim(rollDeg: 100, side: .left)
        XCTAssertEqual(attitude, -10, accuracy: 0.3)
        XCTAssertEqual(-attitude, 10, accuracy: 0.3)
    }

    func testTrimBowDownLandscapeRightEulerDefault() {
        let attitude = LandscapeCompass.eulerLandscapeTrim(rollDeg: -100, side: .right)
        XCTAssertEqual(attitude, -10, accuracy: 0.3)
        XCTAssertEqual(-attitude, 10, accuracy: 0.3)
    }

    func testTrimLevelBothLandscapeSides() {
        XCTAssertEqual(LandscapeCompass.eulerLandscapeTrim(rollDeg: 90, side: .left), 0, accuracy: 0.2)
        XCTAssertEqual(LandscapeCompass.eulerLandscapeTrim(rollDeg: -90, side: .right), 0, accuracy: 0.2)
    }

    func testFaceVerticalTrimLevel() {
        let attitude = LandscapeCompass.faceVerticalTrim(
            pitchDeg: 0,
            rollDeg: 0,
            gravityX: 0,
            gravityY: 0,
            gravityZ: -1
        )
        XCTAssertEqual(attitude ?? 999, 0, accuracy: 0.2)
    }

    func testFaceVerticalTrimBowUp() {
        let attitude = LandscapeCompass.faceVerticalTrim(
            pitchDeg: 8,
            rollDeg: 0,
            gravityX: 0,
            gravityY: 0,
            gravityZ: -1
        )
        XCTAssertEqual(attitude ?? 999, -8, accuracy: 0.2)
    }

    func testDisplayTrimInvertsRaw() {
        let sample = AttitudeSample(
            headingDegrees: 90,
            heelDegrees: 0,
            trimDegrees: -4,
            fineHeelDegrees: 0,
            fineTrimDegrees: -4,
            turnDegreesPerSecond: 0,
            publishTimestamp: 0,
            isLandscapePose: true,
            landscapeSide: .right,
            rawYawDegrees: 0,
            rawPitchDegrees: 0,
            rawRollDegrees: -90,
            rawGravityX: 0,
            rawGravityY: 0,
            rawGravityZ: -1
        )
        XCTAssertEqual(sample.displayTrimDegreesInt, 4)
    }
}

final class PhoneMessageCodecTests: XCTestCase {
    func testCompassSamplePayload() {
        let sample = AttitudeSample(
            headingDegrees: 90,
            heelDegrees: 5,
            trimDegrees: -2,
            fineHeelDegrees: 5,
            fineTrimDegrees: -2,
            turnDegreesPerSecond: 0.2,
            publishTimestamp: 1_700_000_000,
            isLandscapePose: true,
            landscapeSide: .right,
            rawYawDegrees: -90,
            rawPitchDegrees: -5,
            rawRollDegrees: -92,
            rawGravityX: 0.087,
            rawGravityY: 0,
            rawGravityZ: -0.996
        )
        let payload = PhoneMessageCodec.compassSample(sample)
        XCTAssertEqual(payload["event"] as? String, "compass_sample")
        XCTAssertEqual(payload["h"] as? Int, 90)
        XCTAssertEqual(payload["e"] as? Int, 5)
        XCTAssertEqual(payload["r"] as? Double ?? (payload["r"] as? NSNumber)?.doubleValue, 0.2, accuracy: 0.01)
        XCTAssertEqual(payload["m"] as? Int, 2)
        XCTAssertEqual(payload["t"] as? Int, 1_700_000_000)
    }

    func testCountdownSyncPayload() {
        let payload = PhoneMessageCodec.countdownSync(gunUnix: 1_700_000_000)
        XCTAssertEqual(payload["event"] as? String, "countdown_sync")
        XCTAssertEqual(payload["running"] as? Bool, true)
        XCTAssertEqual(payload["timestamp"] as? TimeInterval, 1_700_000_000)
    }

    func testCountdownHaltPayload() {
        let payload = PhoneMessageCodec.countdownHalt(remainingSeconds: 240)
        XCTAssertEqual(payload["running"] as? Bool, false)
        XCTAssertEqual(payload["remaining"] as? Int, 240)
    }

    func testParseStartTimer() {
        let message = PhoneMessageCodec.parseWatchMessage([
            "event": "start_timer",
            "timestamp": 1_700_000_000.0,
        ])
        XCTAssertEqual(message, .startTimer(timestamp: 1_700_000_000))
    }

    func testParseCountdownHalt() {
        let message = PhoneMessageCodec.parseWatchMessage([
            "event": "countdown_state",
            "running": false,
            "remaining": 180,
        ])
        XCTAssertEqual(message, .countdownHalted(remainingSeconds: 180))
    }

    func testParseScreenSync() {
        let message = PhoneMessageCodec.parseWatchMessage([
            "event": "screen_sync",
            "screen": "trim_turn",
        ])
        XCTAssertEqual(message, .screenSync(.trimTurn))
    }

    func testParseActivityEnded() {
        let message = PhoneMessageCodec.parseWatchMessage([
            "event": "activity_ended",
        ])
        XCTAssertEqual(message, .activityEnded)
    }

    func testParseGpsSample() {
        let message = PhoneMessageCodec.parseWatchMessage([
            "event": "gps_sample",
            "sog": 6.2,
            "has_fix": true,
        ])
        guard case let .gpsSample(sample) = message else {
            XCTFail("Expected gpsSample")
            return
        }
        XCTAssertEqual(sample.sogKnots, 6.2, accuracy: 0.01)
        XCTAssertTrue(sample.hasFix)
    }

    func testParseGpsSampleWithCog() {
        let message = PhoneMessageCodec.parseWatchMessage([
            "event": "gps_sample",
            "sog": 6.2,
            "has_fix": true,
            "cog": 90,
        ])
        guard case let .gpsSample(sample) = message else {
            XCTFail("Expected gpsSample")
            return
        }
        XCTAssertEqual(sample.cogDegrees ?? 0, 90, accuracy: 0.01)
    }

    func testVmgUpdatePayload() {
        let payload = PhoneMessageCodec.vmgUpdate(vmgKnots: 4.5, mode: .downwind)
        XCTAssertEqual(payload["event"] as? String, "vmg_update")
        XCTAssertEqual(payload["vmg"] as? Double, 4.5)
        XCTAssertEqual(payload["mode"] as? String, "downwind")
    }

    func testParseBaseWindSet() {
        let message = PhoneMessageCodec.parseWatchMessage([
            "event": "base_wind_set",
            "bwb": 127,
        ])
        guard case let .baseWindSet(degrees) = message else {
            XCTFail("Expected baseWindSet")
            return
        }
        XCTAssertEqual(degrees, 127, accuracy: 0.01)
    }

    func testParseScreenSyncSog() {
        let message = PhoneMessageCodec.parseWatchMessage([
            "event": "screen_sync",
            "screen": "sog",
        ])
        XCTAssertEqual(message, .screenSync(.sog))
    }

    func testDisplayConfigPayload() {
        let payload = PhoneMessageCodec.displayConfig(tier: .pro)
        XCTAssertEqual(payload["event"] as? String, "display_config")
        XCTAssertEqual(payload["tier"] as? String, "pro")
    }

    func testLandscapeScreenSwipeOrderWithSog() {
        XCTAssertEqual(LandscapeScreen.headingHeel.next(allowsSog: true), .trimTurn)
        XCTAssertEqual(LandscapeScreen.trimTurn.next(allowsSog: true), .sog)
        XCTAssertEqual(LandscapeScreen.sog.next(allowsSog: true), .headingHeel)
        XCTAssertEqual(LandscapeScreen.headingHeel.previous(allowsSog: true), .sog)
        XCTAssertEqual(LandscapeScreen.sog.previous(allowsSog: true), .trimTurn)
    }

    func testLandscapeScreenSwipeOrderCoreTier() {
        XCTAssertEqual(LandscapeScreen.racingScreens(allowsSog: false), [.headingHeel, .trimTurn])
        XCTAssertEqual(LandscapeScreen.trimTurn.next(allowsSog: false), .headingHeel)
        XCTAssertEqual(LandscapeScreen.headingHeel.previous(allowsSog: false), .trimTurn)
        XCTAssertEqual(LandscapeScreen.sog.resolvedForDisplayTier(.core), .headingHeel)
    }

    func testLandscapeScreenRacingCycleWithSog() {
        XCTAssertEqual(LandscapeScreen.racingScreens(allowsSog: true), [.headingHeel, .trimTurn, .sog])
    }
}
