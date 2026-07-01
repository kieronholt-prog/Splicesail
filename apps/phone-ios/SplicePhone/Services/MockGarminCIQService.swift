import Foundation

@MainActor
final class MockGarminCIQService: GarminCIQConnectable {
    var onWatchLinkReady: (@MainActor () -> Void)?
    private var connectionContinuation: AsyncStream<PhoneLinkState>.Continuation?
    private var messageContinuation: AsyncStream<WatchInboundMessage>.Continuation?

    lazy var connectionStateStream: AsyncStream<PhoneLinkState> = {
        AsyncStream { continuation in
            connectionContinuation = continuation
        }
    }()

    lazy var messageStream: AsyncStream<WatchInboundMessage> = {
        AsyncStream { continuation in
            messageContinuation = continuation
        }
    }()

    func start() async {
        connectionContinuation?.yield(.connected)
    }

    func handleDeviceSelection(from url: URL) {}

    func showDeviceSelection() {}

    func sendCompassSample(_ sample: AttitudeSample) {}

    func sendCountdownSync(gunUnix: TimeInterval) async -> Bool { true }

    func sendCountdownHalt(remainingSeconds: Int) async {}

    func sendDisplayConfig(tier: DisplayTier) async {}

    func sendVmgUpdate(vmgKnots: Double, mode: VmgDisplayMode) {}

    func acknowledgeStartTimer() async throws {}

    func simulateWatchStart(at timestamp: TimeInterval = Date().timeIntervalSince1970) {
        messageContinuation?.yield(.startTimer(timestamp: timestamp))
    }

    func simulateWatchHalt(remainingSeconds: Int = 300) {
        messageContinuation?.yield(.countdownHalted(remainingSeconds: remainingSeconds))
    }

    func simulateScreenSync(_ screen: WatchMirroredScreen) {
        messageContinuation?.yield(.screenSync(screen))
    }

    func simulateActivityEnded() {
        messageContinuation?.yield(.activityEnded)
    }

    func simulateGpsSample(sogKnots: Double = 6.2, hasFix: Bool = true) {
        messageContinuation?.yield(
            .gpsSample(WatchGpsSample(sogKnots: sogKnots, hasFix: hasFix, receivedAt: Date()))
        )
    }
}
