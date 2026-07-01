import XCTest
@testable import SplicePhone

final class RaceTimerFormatTests: XCTestCase {
    func testPreGunUnderOneMinute() {
        let line = RaceTimerFormat.line(phase: .countdown(secondsRemaining: 42), presetMinutes: 5)
        XCTAssertEqual(line, "42")
    }

    func testPreGunOverOneMinute() {
        let line = RaceTimerFormat.line(phase: .countdown(secondsRemaining: 305), presetMinutes: 5)
        XCTAssertEqual(line, "5:05")
    }

    func testHaltedIdleShowsExactSeconds() {
        let line = RaceTimerFormat.line(phase: .idle, presetMinutes: 2, haltedRemainingSeconds: 105)
        XCTAssertEqual(line, "1:45")
    }

    func testElapsedHeader() {
        XCTAssertEqual(RaceTimerFormat.header(for: .racing(elapsedSeconds: 12)), "ELAPSED")
    }
}
