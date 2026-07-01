import Foundation

@MainActor
final class WindEstimationViewModel: ObservableObject {
    @Published private(set) var snapshot = WindEstimationSnapshot(
        vmgKnots: nil,
        displayMode: .upwind,
        windDegrees: nil,
        hasWind: false,
        windAngleDegrees: nil,
        possibleShift: false,
        statusMessage: "Set base wind in phone settings"
    )
    @Published var settings: SailingConditionSettings

    private let engine = WindEstimationEngine()
    private weak var garminService: GarminCIQConnectable?
    private var lastVmgTransmit = Date.distantPast
    private let vmgTransmitInterval: TimeInterval = 1.0

    init() {
        settings = SailingSettingsStore.load()
        engine.updateSettings(settings)
        snapshot = engine.snapshot
    }

    func bindGarminService(_ service: GarminCIQConnectable) {
        garminService = service
    }

    func applySettings() {
        engine.updateSettings(settings)
        snapshot = engine.snapshot
        transmitVmgToWatchIfNeeded(force: true)
    }

    func setBaseWind(from heading: Double) {
        engine.setBaseWind(heading)
        settings.baseWindDegrees = CircularHeading.normalize(heading)
        snapshot = engine.snapshot
        transmitVmgToWatchIfNeeded(force: true)
    }

    func ingestAttitude(_ sample: AttitudeSample) {
        guard let heading = sample.headingDegrees.map(Double.init) else { return }
        engine.ingestAttitude(
            heading: heading,
            heel: sample.displayHeelDegrees,
            turnRate: sample.turnDegreesPerSecond
        )
        snapshot = engine.snapshot
        transmitVmgToWatchIfNeeded()
    }

    func ingestGps(_ sample: WatchGpsSample) {
        engine.ingestGps(sog: sample.sogKnots, cog: sample.cogDegrees, hasFix: sample.hasFix)
        snapshot = engine.snapshot
        transmitVmgToWatchIfNeeded()
    }

    func resetSession() {
        engine.resetSession()
        snapshot = engine.snapshot
    }

    private func transmitVmgToWatchIfNeeded(force: Bool = false) {
        let now = Date()
        guard force || now.timeIntervalSince(lastVmgTransmit) >= vmgTransmitInterval else { return }
        guard let vmg = snapshot.vmgKnots, snapshot.hasWind else { return }
        lastVmgTransmit = now
        garminService?.sendVmgUpdate(vmgKnots: vmg, mode: snapshot.displayMode)
    }
}
