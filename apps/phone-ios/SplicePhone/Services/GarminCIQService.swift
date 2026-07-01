import ConnectIQ
import Foundation

/// Garmin Connect IQ Mobile SDK bridge — compass samples and start-timer sync.
@MainActor
final class GarminCIQService: NSObject, GarminCIQConnectable {
    private var connectionContinuation: AsyncStream<PhoneLinkState>.Continuation?
    private var messageContinuation: AsyncStream<WatchInboundMessage>.Continuation?
    private var sailingApp: IQApp?
    private var lastCompassSendAt: Date?
    private var lastSentHeading: Int?
    private var pendingCompassSample: AttitudeSample?
    private var pendingVmgUpdate: (knots: Double, mode: VmgDisplayMode)?
    private var lastVmgSendAt: Date?
    private var outboundPumpTask: Task<Void, Never>?
    private var outboundInFlight = false
    private var lastSkipLogAt: Date?
    private let skipOpenAppRequest = true

    /// Steady-state compass rate — SDK queues sends; do not wait for completion.
    private var compassTransmitPeriod: TimeInterval {
        Double(ConnectIQConstants.compassTransmitPeriodMilliseconds) / 1000.0
    }

    private let compassHeadingMinInterval: TimeInterval = 0.25
    private let vmgTransmitPeriod: TimeInterval = 1.0
    private let vmgCompassQuietPeriod: TimeInterval = 0.35

    private var isStarted = false
    private var deviceReady = false
    private var watchAppOpenRequested = false
    private var lastConnectionState: PhoneLinkState = .starting
    var onWatchLinkReady: (@MainActor () -> Void)?

    lazy var connectionStateStream: AsyncStream<PhoneLinkState> = {
        AsyncStream { continuation in
            connectionContinuation = continuation
            continuation.yield(lastConnectionState)
        }
    }()

    lazy var messageStream: AsyncStream<WatchInboundMessage> = {
        AsyncStream { continuation in
            messageContinuation = continuation
        }
    }()

    func start() async {
        guard !isStarted else {
            refreshRegistration()
            refreshConnectionState()
            return
        }
        isStarted = true
        publishConnection(.starting)
        refreshRegistration()
        refreshConnectionState()
    }

    func handleDeviceSelection(from url: URL) {
        guard ConnectIQDeviceStore.shared.handleOpenURL(url) else {
            NSLog("PhoneLink: URL not a device-selection response — %@", url.absoluteString)
            return
        }
        refreshRegistration()
        refreshConnectionState()
    }

    func showDeviceSelection() {
        ConnectIQ.sharedInstance().showDeviceSelection()
    }

    /// Keeps latest sample; pumps outbound queue without waiting for BLE completion.
    func sendCompassSample(_ sample: AttitudeSample) {
        guard let app = activeApp() else {
            logSkipIfDue(skipReason())
            return
        }

        openWatchAppIfNeeded(app)
        pendingCompassSample = sample
        let headingChanged = sample.headingDegrees != lastSentHeading
        pumpOutbound(via: app, headingPriority: headingChanged)
    }

    func sendCountdownSync(gunUnix: TimeInterval) async -> Bool {
        guard let app = sailingApp, let device = app.device, device.uuid != nil else {
            return false
        }

        guard deviceReady else {
            return false
        }

        let status = ConnectIQ.sharedInstance().getDeviceStatus(device)
        guard status == .connected else {
            publishConnection(.notConnected)
            return false
        }

        openWatchAppIfNeeded(app)
        let payload = PhoneMessageCodec.countdownSync(gunUnix: gunUnix)
        await sendMessage(payload, to: app, label: "countdown_sync")
        return true
    }

    func sendCountdownHalt(remainingSeconds: Int) async {
        guard let app = sailingApp, let device = app.device, device.uuid != nil else {
            return
        }

        guard deviceReady else {
            return
        }

        let status = ConnectIQ.sharedInstance().getDeviceStatus(device)
        guard status == .connected else {
            publishConnection(.notConnected)
            return
        }

        openWatchAppIfNeeded(app)
        let payload = PhoneMessageCodec.countdownHalt(remainingSeconds: remainingSeconds)
        await sendMessage(payload, to: app, label: "countdown_halt")
    }

    func sendDisplayConfig(tier: DisplayTier) async {
        guard let app = sailingApp, let device = app.device, device.uuid != nil else {
            return
        }

        guard deviceReady else {
            return
        }

        let status = ConnectIQ.sharedInstance().getDeviceStatus(device)
        guard status == .connected else {
            return
        }

        openWatchAppIfNeeded(app)
        let payload = PhoneMessageCodec.displayConfig(tier: tier)
        await sendMessage(payload, to: app, label: "display_config", transient: true)
    }

    func sendVmgUpdate(vmgKnots: Double, mode: VmgDisplayMode) {
        guard let app = activeApp() else {
            return
        }

        openWatchAppIfNeeded(app)
        pendingVmgUpdate = (vmgKnots, mode)
        pumpOutbound(via: app, headingPriority: false)
    }

    func acknowledgeStartTimer() async throws {
        guard let app = sailingApp, let device = app.device, device.uuid != nil else {
            throw GarminCIQError.noDevice
        }
        let payload = PhoneMessageCodec.startTimerAck()
        await sendMessage(payload, to: app, label: "start_timer_ack")
    }

    private func refreshRegistration() {
        outboundPumpTask?.cancel()
        outboundPumpTask = nil
        outboundInFlight = false

        let store = ConnectIQDeviceStore.shared
        guard let device = store.primaryDevice else {
            sailingApp = nil
            publishConnection(.noDevice)
            return
        }

        ConnectIQ.sharedInstance().register(forDeviceEvents: device, delegate: self)

        guard let appUUID = UUID(uuidString: ConnectIQConstants.watchAppUUID) else {
            publishConnection(.error("Invalid watch app UUID"))
            return
        }

        guard let app = IQApp(uuid: appUUID, store: appUUID, device: device) else {
            publishConnection(.error("Could not create watch app reference"))
            return
        }
        sailingApp = app
        ConnectIQ.sharedInstance().register(forAppMessages: app, delegate: self)
        NSLog("PhoneLink: registered for Sailing Performance on %@", device.friendlyName ?? "watch")
        verifyWatchAppInstalled(app)
        refreshConnectionState()
    }

    private func verifyWatchAppInstalled(_ app: IQApp) {
        ConnectIQ.sharedInstance().getAppStatus(app) { status in
            Task { @MainActor [weak self] in
                guard let self else {
                    return
                }
                guard let status else {
                    NSLog("PhoneLink: could not query watch app status")
                    return
                }
                if status.isInstalled {
                    NSLog("PhoneLink: Splice watch app installed (v%d)", status.version)
                } else {
                    NSLog("PhoneLink: Splice watch app NOT installed on device — sideload via Garmin Connect")
                    self.publishConnection(.error("Splice watch app not installed on watch"))
                }
            }
        }
    }

    private func openWatchAppIfNeeded(_ app: IQApp) {
        if skipOpenAppRequest {
            return
        }
        guard !watchAppOpenRequested else {
            return
        }
        watchAppOpenRequested = true
        ConnectIQ.sharedInstance().openAppRequest(app) { result in
            NSLog(
                "PhoneLink: open watch app — %@",
                NSStringFromSendMessageResult(result)
            )
        }
    }

    private func markDeviceReady() {
        guard !deviceReady else {
            return
        }
        deviceReady = true
        onWatchLinkReady?()
    }

    private func refreshConnectionState() {
        guard let device = ConnectIQDeviceStore.shared.primaryDevice else {
            publishConnection(.noDevice)
            return
        }
        let status = ConnectIQ.sharedInstance().getDeviceStatus(device)
        switch status {
        case .connected:
            markDeviceReady()
            publishConnection(.connected)
            if let app = sailingApp {
                openWatchAppIfNeeded(app)
            }
        case .notFound:
            publishConnection(.noDevice)
        default:
            publishConnection(.notConnected)
        }
    }

    private func activeApp() -> IQApp? {
        guard let app = sailingApp, let device = app.device, device.uuid != nil else {
            return nil
        }

        guard deviceReady else {
            return nil
        }

        let status = ConnectIQ.sharedInstance().getDeviceStatus(device)
        guard status == .connected else {
            publishConnection(.notConnected)
            return nil
        }

        return app
    }

    private func pumpOutbound(via app: IQApp, headingPriority: Bool) {
        if isVmgSendDue(), trySendVmg(via: app) {
            if pendingCompassSample != nil || pendingVmgUpdate != nil {
                scheduleOutboundPumpWhenDue(headingPriority: false)
            }
            return
        }

        if trySendCompass(via: app, headingPriority: headingPriority) {
            if pendingCompassSample != nil || pendingVmgUpdate != nil {
                scheduleOutboundPumpWhenDue(headingPriority: false)
            }
            return
        }

        if trySendVmg(via: app) {
            if pendingCompassSample != nil || pendingVmgUpdate != nil {
                scheduleOutboundPumpWhenDue(headingPriority: false)
            }
            return
        }

        scheduleOutboundPumpWhenDue(headingPriority: headingPriority)
    }

    private func isVmgSendDue(now: Date = Date()) -> Bool {
        guard pendingVmgUpdate != nil else {
            return false
        }
        if let lastVmgSendAt, now.timeIntervalSince(lastVmgSendAt) < vmgTransmitPeriod {
            return false
        }
        if let lastCompassSendAt, now.timeIntervalSince(lastCompassSendAt) < vmgCompassQuietPeriod {
            return false
        }
        return true
    }

    private func trySendCompass(via app: IQApp, headingPriority: Bool) -> Bool {
        guard !outboundInFlight else {
            return false
        }
        guard let sample = pendingCompassSample else {
            return false
        }

        let now = Date()
        let minInterval = headingPriority ? compassHeadingMinInterval : compassTransmitPeriod
        if let lastCompassSendAt, now.timeIntervalSince(lastCompassSendAt) < minInterval {
            return false
        }

        pendingCompassSample = nil
        lastCompassSendAt = now
        lastSentHeading = sample.headingDegrees

        let payload = PhoneMessageCodec.compassSample(sample)
        outboundInFlight = true
        ConnectIQ.sharedInstance().sendMessage(
            payload,
            to: app,
            progress: nil,
            completion: { [weak self] result in
                Task { @MainActor in
                    guard let self else {
                        return
                    }
                    self.outboundInFlight = false
                    if result != .success {
                        NSLog(
                            "PhoneLink: compass_sample send failed — %@",
                            NSStringFromSendMessageResult(result)
                        )
                    }
                    self.resumeOutboundPump()
                }
            },
            isTransient: true
        )
        return true
    }

    private func skipReason() -> String {
        guard sailingApp != nil else {
            return "compass_sample skipped — no watch app registered (pair in Settings)"
        }
        guard deviceReady else {
            return "compass_sample skipped — device not ready yet"
        }
        guard let device = sailingApp?.device, device.uuid != nil else {
            return "compass_sample skipped — watch device UUID nil"
        }
        let status = ConnectIQ.sharedInstance().getDeviceStatus(device)
        if status != .connected {
            return "compass_sample skipped — watch not connected (open Garmin Connect)"
        }
        return "compass_sample skipped — link unavailable"
    }

    private func logSkipIfDue(_ message: String) {
        let now = Date()
        if let lastSkipLogAt, now.timeIntervalSince(lastSkipLogAt) < 5 {
            return
        }
        lastSkipLogAt = now
        NSLog("PhoneLink: %@", message)
    }

    private func trySendVmg(via app: IQApp) -> Bool {
        guard !outboundInFlight else {
            return false
        }
        guard let pending = pendingVmgUpdate else {
            return false
        }

        let now = Date()
        if let lastCompassSendAt, now.timeIntervalSince(lastCompassSendAt) < vmgCompassQuietPeriod {
            return false
        }
        if let lastVmgSendAt, now.timeIntervalSince(lastVmgSendAt) < vmgTransmitPeriod {
            return false
        }

        pendingVmgUpdate = nil
        lastVmgSendAt = now

        let payload = PhoneMessageCodec.vmgUpdate(vmgKnots: pending.knots, mode: pending.mode)
        outboundInFlight = true
        ConnectIQ.sharedInstance().sendMessage(
            payload,
            to: app,
            progress: nil,
            completion: { [weak self] result in
                Task { @MainActor in
                    guard let self else {
                        return
                    }
                    self.outboundInFlight = false
                    if result != .success {
                        NSLog(
                            "PhoneLink: vmg_update send failed — %@",
                            NSStringFromSendMessageResult(result)
                        )
                    }
                    self.resumeOutboundPump()
                }
            },
            isTransient: true
        )
        return true
    }

    private func scheduleOutboundPumpWhenDue(headingPriority: Bool) {
        if outboundInFlight {
            return
        }

        let now = Date()
        var delays: [TimeInterval] = []

        if pendingCompassSample != nil {
            let minInterval = headingPriority ? compassHeadingMinInterval : compassTransmitPeriod
            if let lastCompassSendAt {
                delays.append(max(0, minInterval - now.timeIntervalSince(lastCompassSendAt)))
            } else {
                delays.append(0)
            }
        }

        if pendingVmgUpdate != nil {
            var vmgDelay: TimeInterval = 0
            if let lastVmgSendAt {
                vmgDelay = max(vmgDelay, vmgTransmitPeriod - now.timeIntervalSince(lastVmgSendAt))
            }
            if let lastCompassSendAt {
                vmgDelay = max(vmgDelay, vmgCompassQuietPeriod - now.timeIntervalSince(lastCompassSendAt))
            }
            delays.append(max(0, vmgDelay))
        }

        guard let delay = delays.min() else {
            return
        }

        scheduleOutboundPump(after: delay)
    }

    private func scheduleOutboundPump(after delay: TimeInterval) {
        if outboundInFlight {
            return
        }

        outboundPumpTask?.cancel()
        let wait = max(delay, 0.002)

        outboundPumpTask = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000))
            guard let self, !Task.isCancelled else {
                return
            }
            self.outboundPumpTask = nil
            guard let app = self.activeApp() else {
                return
            }
            self.pumpOutbound(via: app, headingPriority: false)
        }
    }

    /// Resume pumping after Connect IQ completion — always async; never recurse on the main stack.
    private func resumeOutboundPump() {
        Task { @MainActor [weak self] in
            await Task.yield()
            guard let self else {
                return
            }
            guard let app = self.activeApp() else {
                return
            }
            self.pumpOutbound(via: app, headingPriority: false)
        }
    }

    private func sendMessage(
        _ payload: [String: Any],
        to app: IQApp,
        label: String,
        transient: Bool = false
    ) async {
        guard let device = app.device, device.uuid != nil else {
            NSLog("PhoneLink: skipped %@ — device UUID nil", label)
            return
        }

        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            ConnectIQ.sharedInstance().sendMessage(
                payload,
                to: app,
                progress: nil,
                completion: { result in
                    if result == .success {
                        if label != "compass_sample" && label != "countdown_sync" && label != "countdown_halt" {
                            NSLog("PhoneLink: %@ sent", label)
                        }
                    } else {
                        NSLog(
                            "PhoneLink: %@ send failed — %@",
                            label,
                            NSStringFromSendMessageResult(result)
                        )
                    }
                    continuation.resume()
                },
                isTransient: transient
            )
        }
    }

    private func publishConnection(_ state: PhoneLinkState) {
        lastConnectionState = state
        connectionContinuation?.yield(state)
    }
}

extension GarminCIQService: IQDeviceEventDelegate {
    nonisolated func deviceStatusChanged(_ device: IQDevice, status: IQDeviceStatus) {
        Task { @MainActor in
            switch status {
            case .connected:
                NSLog("PhoneLink: device connected — %@", device.friendlyName ?? "watch")
            case .notFound:
                NSLog("PhoneLink: device not found")
                deviceReady = false
                outboundPumpTask?.cancel()
                outboundPumpTask = nil
                outboundInFlight = false
                publishConnection(.noDevice)
            default:
                NSLog("PhoneLink: device not connected — %@", device.friendlyName ?? "watch")
                deviceReady = false
                outboundPumpTask?.cancel()
                outboundPumpTask = nil
                outboundInFlight = false
                publishConnection(.notConnected)
            }
        }
    }

    nonisolated func deviceCharacteristicsDiscovered(_ device: IQDevice) {
        Task { @MainActor in
            NSLog("PhoneLink: device ready — %@", device.friendlyName ?? "watch")
            markDeviceReady()
            publishConnection(.connected)
            if let app = sailingApp {
                openWatchAppIfNeeded(app)
            }
        }
    }
}

extension GarminCIQService: IQAppMessageDelegate {
    nonisolated func receivedMessage(_ message: Any, from app: IQApp) {
        Task { @MainActor in
            guard let parsed = PhoneMessageCodec.parseWatchMessage(message) else {
                NSLog("PhoneLink: ignored inbound message — %@", String(describing: message))
                return
            }
            switch parsed {
            case let .startTimer(timestamp):
                NSLog("PhoneLink: received start_timer @ %.0f", timestamp)
            case let .countdownHalted(remaining):
                NSLog("PhoneLink: received countdown_halt remaining=%d", remaining)
            case let .screenSync(screen):
                NSLog("PhoneLink: received screen_sync %@", screen.rawValue)
            case .activityEnded:
                NSLog("PhoneLink: received activity_ended")
            case .gpsSample:
                break
            case let .baseWindSet(degrees):
                NSLog("PhoneLink: received base_wind_set bwb=%.0f", degrees)
            }
            messageContinuation?.yield(parsed)
        }
    }
}

enum GarminCIQError: LocalizedError {
    case noDevice

    var errorDescription: String? {
        switch self {
        case .noDevice:
            return "No Garmin device registered. Pair via Connect IQ device selection."
        }
    }
}
