import XCTest
@testable import SplicePhone

final class RaceTimerTests: XCTestCase {
    func testCountdownUsesFloorForWholeSeconds() {
        let gun = Date(timeIntervalSince1970: 1_000)
        let now = Date(timeIntervalSince1970: 700.9)
        let state = RaceTimer.state(
            startGunUTC: gun,
            countdownDurationSeconds: 300,
            now: now
        )

        guard case let .countdown(secondsRemaining) = state.phase else {
            return XCTFail("Expected countdown phase")
        }
        XCTAssertEqual(secondsRemaining, 300)
    }

    func testArmCountdownUsesUnixOffset() {
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        let gun = RaceTimer.armCountdown(durationSeconds: 300, now: now)
        XCTAssertEqual(gun.timeIntervalSince1970, now.timeIntervalSince1970 + 300, accuracy: 0.01)
    }

    func testRacingPhaseAfterGun() {
        let gun = Date(timeIntervalSince1970: 1_000)
        let now = Date(timeIntervalSince1970: 1_065)
        let state = RaceTimer.state(startGunUTC: gun, countdownDurationSeconds: 300, now: now)
        guard case let .racing(elapsedSeconds) = state.phase else {
            return XCTFail("Expected racing phase")
        }
        XCTAssertEqual(elapsedSeconds, 65)
    }
}
