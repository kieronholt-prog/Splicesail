import XCTest
@testable import SplicePhone

final class WindEstimationTests: XCTestCase {
    func testCircularMeanWrapsAt360() {
        let mean = CircularHeading.mean([350, 10])
        XCTAssertNotNil(mean)
        XCTAssertEqual(mean ?? 0, 0, accuracy: 1)
    }

    func testVmgUpwindPositive() {
        let vmg = CircularHeading.vmgKnots(sog: 6, heading: 45, windFrom: 0)
        XCTAssertGreaterThan(vmg, 0)
    }

    func testKalmanFilterAcceptsMeasurement() {
        var filter = WindKalmanFilter()
        filter.reset(windDegrees: 0, variance: 25)
        filter.predict(processNoise: 1)
        filter.update(measurement: 10, measurementNoise: 20)
        XCTAssertNotNil(filter.windDegrees)
        XCTAssertGreaterThan(filter.windDegrees ?? 0, 0)
    }

    func testEngineProducesVmgAfterBaseWindSet() {
        let engine = WindEstimationEngine()
        engine.setBaseWind(0)
        engine.ingestGps(sog: 6, cog: 5, hasFix: true)
        engine.ingestAttitude(heading: 45, heel: 10, turnRate: 0.5)
        let snapshot = engine.snapshot
        XCTAssertTrue(snapshot.hasWind)
        XCTAssertNotNil(snapshot.vmgKnots)
    }

    func testEarlyWarningShiftClearsAfterRecovery() {
        let engine = WindEstimationEngine()
        engine.setBaseWind(0)
        engine.ingestGps(sog: 6, cog: 5, hasFix: true)

        let start = Date()
        engine.ingestAttitude(heading: 2, heel: 0, turnRate: 0, timestamp: start)
        XCTAssertTrue(engine.snapshot.possibleShift)

        engine.ingestAttitude(heading: 50, heel: 0, turnRate: 0, timestamp: start.addingTimeInterval(1))
        XCTAssertTrue(engine.snapshot.possibleShift)

        engine.ingestAttitude(heading: 50, heel: 0, turnRate: 0, timestamp: start.addingTimeInterval(14))
        XCTAssertFalse(engine.snapshot.possibleShift)
    }

    func testRetroactiveNeighborBoost() {
        var analyzer = LegAnalyzer()
        analyzer.testInsertCompletedLeg(
            CompletedLeg(
                heading: 45,
                durationSeconds: 15,
                quality: 0.55,
                isCloseHauled: true,
                meanSog: 5.5
            )
        )

        analyzer.beginLeg(at: Date().addingTimeInterval(-50), heading: 50)
        for offset in stride(from: 0.0, through: 50.0, by: 1.0) {
            _ = analyzer.tick(
                time: Date().addingTimeInterval(-50 + offset),
                heading: 50,
                cog: 50,
                sog: 6,
                heel: 8,
                windDegrees: 0,
                tide: .none,
                deltaSeconds: 1
            )
        }

        let longLeg = analyzer.finalizeLeg(windDegrees: 0, tide: .none)
        XCTAssertNotNil(longLeg)
        XCTAssertGreaterThanOrEqual(longLeg?.durationSeconds ?? 0, 45)

        let boostedShortLeg = analyzer.testCompletedLeg(at: 0)
        XCTAssertEqual(boostedShortLeg?.quality ?? 0, 0.75, accuracy: 0.01)
        XCTAssertTrue(boostedShortLeg?.neighborBoostApplied ?? false)
    }
}
