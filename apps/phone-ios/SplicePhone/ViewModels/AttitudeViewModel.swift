import Foundation

@MainActor
final class AttitudeViewModel: ObservableObject {
    @Published private(set) var latestSample: AttitudeSample?
    @Published private(set) var phoneLinkState: PhoneLinkState = .starting
    @Published private(set) var hasHeelZeroOffset = AttitudeZeroStore.hasHeelOffset
    @Published private(set) var hasTrimZeroOffset = AttitudeZeroStore.hasTrimOffset

    private(set) var garminService: GarminCIQConnectable

    private let motionService: MotionConnectable
    private var motionTask: Task<Void, Never>?
    private var phoneLinkTask: Task<Void, Never>?
    private var attitudePublisher = AttitudePublisher()

    init(motionService: MotionConnectable, garminService: GarminCIQConnectable) {
        self.motionService = motionService
        self.garminService = garminService
    }

    deinit {
        motionTask?.cancel()
        phoneLinkTask?.cancel()
    }

    func start() {
        refreshZeroOffsetFlags()

        if phoneLinkTask == nil {
            phoneLinkTask = Task {
                for await state in garminService.connectionStateStream {
                    phoneLinkState = state
                }
            }
        }

        guard motionTask == nil else {
            Task { await garminService.start() }
            return
        }

        motionTask = Task {
            attitudePublisher.reset()
            await motionService.start()
            await garminService.start()
            for await motion in motionService.sampleStream {
                let result = attitudePublisher.ingest(motion)
                latestSample = result.display
                if let transmit = result.transmit {
                    garminService.sendCompassSample(transmit)
                }
            }
        }
    }

    func handleDeviceSelectionURL(_ url: URL) {
        garminService.handleDeviceSelection(from: url)
    }

    func stop() {
        motionTask?.cancel()
        phoneLinkTask?.cancel()
        Task {
            await motionService.stop()
        }
    }

    func showGarminDeviceSelection() {
        garminService.showDeviceSelection()
    }

    func zeroHeel() {
        guard let latestSample else {
            return
        }
        motionService.zeroHeel(at: latestSample)
        refreshZeroOffsetFlags()
    }

    func zeroTrim() {
        guard let latestSample else {
            return
        }
        motionService.zeroTrim(at: latestSample)
        refreshZeroOffsetFlags()
    }

    func clearZeroOffsets() {
        motionService.clearZeroOffsets()
        refreshZeroOffsetFlags()
    }

    var phoneLinkStatusLabel: String {
        switch phoneLinkState {
        case .starting:
            return "Starting Connect IQ link…"
        case .noDevice:
            return "No Garmin device — tap Pair watch"
        case .notConnected:
            return "Watch not connected — open Garmin Connect"
        case .connected:
            return "Connected via Connect IQ"
        case let .error(message):
            return message
        }
    }

    private func refreshZeroOffsetFlags() {
        hasHeelZeroOffset = AttitudeZeroStore.hasHeelOffset
        hasTrimZeroOffset = AttitudeZeroStore.hasTrimOffset
    }
}
