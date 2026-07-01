import Foundation

protocol GarminCIQConnectable: AnyObject {
    var connectionStateStream: AsyncStream<PhoneLinkState> { get }
    var messageStream: AsyncStream<WatchInboundMessage> { get }
    var onWatchLinkReady: (@MainActor () -> Void)? { get set }
    func start() async
    func handleDeviceSelection(from url: URL)
    func showDeviceSelection()
    func sendCompassSample(_ sample: AttitudeSample)
    func sendCountdownSync(gunUnix: TimeInterval) async -> Bool
    func sendCountdownHalt(remainingSeconds: Int) async
    func sendDisplayConfig(tier: DisplayTier) async
    func sendVmgUpdate(vmgKnots: Double, mode: VmgDisplayMode)
    func acknowledgeStartTimer() async throws
}
