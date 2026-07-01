import XCTest
@testable import SplicePhone

final class HeelBarLayoutTests: XCTestCase {
    func testCenterIsZeroHeel() {
        XCTAssertEqual(HeelBarLayout.normalizedPosition(for: 0), 0.5, accuracy: 0.001)
    }

    func testPortExtreme() {
        XCTAssertEqual(HeelBarLayout.normalizedPosition(for: 30), 0.0, accuracy: 0.001)
    }

    func testStarboardExtreme() {
        XCTAssertEqual(HeelBarLayout.normalizedPosition(for: -30), 1.0, accuracy: 0.001)
    }

    func testGraduationCount() {
        XCTAssertEqual(HeelBarLayout.graduationPositions().count, 11)
    }

    func testTrailStartsOnBubbleAtCenter() {
        let trail = HeelBarLayout.trailSpan(
            heelDegrees: 0,
            minHeel: nil,
            maxHeel: nil,
            barWidth: 300,
            minimumWidth: 28
        )
        XCTAssertEqual(trail.centerX, 150, accuracy: 1)
        XCTAssertEqual(trail.width, 28, accuracy: 0.1)
    }

    func testTrailSpansPortToStarboard() {
        let trail = HeelBarLayout.trailSpan(
            heelDegrees: 0,
            minHeel: -10,
            maxHeel: 10,
            barWidth: 300,
            minimumWidth: 28
        )
        let portX = HeelBarLayout.normalizedPosition(for: 10) * 300
        let starboardX = HeelBarLayout.normalizedPosition(for: -10) * 300
        XCTAssertEqual(trail.centerX - trail.width / 2, portX, accuracy: 0.5)
        XCTAssertEqual(trail.centerX + trail.width / 2, starboardX, accuracy: 0.5)
    }

    func testTrailSurroundsBubbleWhenHistoryOnlyOnPortSide() {
        let bubbleCenter = HeelBarLayout.normalizedPosition(for: 0) * 300
        let trail = HeelBarLayout.trailSpan(
            heelDegrees: 0,
            minHeel: 0,
            maxHeel: 15,
            barWidth: 300,
            minimumWidth: 28
        )
        XCTAssertLessThanOrEqual(trail.centerX - trail.width / 2, bubbleCenter - 14 + 0.5)
        XCTAssertGreaterThanOrEqual(trail.centerX + trail.width / 2, bubbleCenter + 14 - 0.5)
    }
}
