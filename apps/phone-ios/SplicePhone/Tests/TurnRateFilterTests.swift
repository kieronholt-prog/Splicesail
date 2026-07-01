import XCTest
@testable import SplicePhone

final class TurnRateFilterTests: XCTestCase {
    func testSteadyHeadingStaysNearZero() {
        var filter = TurnRateFilter()
        var time = Date(timeIntervalSince1970: 0)

        for _ in 0..<120 {
            _ = filter.update(headingDegrees: 90 + Double.random(in: -0.2...0.2), timestamp: time)
            time.addTimeInterval(1.0 / 60.0)
        }

        XCTAssertLessThan(abs(filter.filteredTurnRateDegreesPerSecond), 0.2)
    }

    func testStepChangeReachesNinetyPercentWithinTwoSeconds() {
        var filter = TurnRateFilter()
        var time = Date(timeIntervalSince1970: 0)

        for _ in 0..<60 {
            _ = filter.update(headingDegrees: 0, timestamp: time)
            time.addTimeInterval(1.0 / 60.0)
        }

        let targetRate = 90.0
        var reached = false
        for _ in 0..<120 {
            _ = filter.update(headingDegrees: 90, timestamp: time)
            time.addTimeInterval(1.0 / 60.0)
            if filter.filteredTurnRateDegreesPerSecond >= targetRate * 0.9 {
                reached = true
                break
            }
        }

        XCTAssertTrue(reached, "Filtered rate should reach 90% of maneuver within ~2s")
    }

    func testWraparoundUsesShortestPath() {
        var filter = TurnRateFilter()
        let t0 = Date(timeIntervalSince1970: 0)
        _ = filter.update(headingDegrees: 350, timestamp: t0)
        _ = filter.update(headingDegrees: 10, timestamp: t0.addingTimeInterval(1))

        XCTAssertGreaterThan(filter.filteredTurnRateDegreesPerSecond, 0)
        XCTAssertLessThan(abs(filter.filteredTurnRateDegreesPerSecond), 30)
    }
}
