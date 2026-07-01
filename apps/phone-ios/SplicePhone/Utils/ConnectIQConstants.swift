import Foundation

enum ConnectIQConstants {
    /// Custom URL scheme — must match Info.plist CFBundleURLSchemes and SDK initialize().
    static let returnURLScheme = "splicephone-ciq"

    /// Sailing Performance watch app — dashed UUID required by iOS SDK.
    static let watchAppUUID = "cb5e1003-a1b2-4c7a-b8f2-1a2b3c4d5e6f"

    static let stateRestorationIdentifier = "com.compassbox.splicephone.ciq"

    static let compassTransmitHertz = 2
    static let compassTransmitPeriodMilliseconds = 1000 / compassTransmitHertz
    static let compassRecordHertz = 1
    static let headingDisplayHertz = 10

    /// Dial scale (°/s) — port (−) to starboard (+).
    static let turnDialMaxDegreesPerSecond = 15.0
}

enum PhoneMessageEvent: String, Sendable {
    case compassSample = "compass_sample"
    case countdownState = "countdown_state"
    case countdownSync = "countdown_sync"
    case screenSync = "screen_sync"
    case activityEnded = "activity_ended"
    case startTimer = "start_timer"
    case startTimerAck = "start_timer_ack"
    case gpsSample = "gps_sample"
    case displayConfig = "display_config"
    case vmgUpdate = "vmg_update"
    case baseWindSet = "base_wind_set"
}

enum PhoneMessageCodec {
    /// Phone → watch compass payload v2 — short keys to minimize CIQ message size.
    /// `h` heading (deg), `r` turn rate (°/s filtered), `t` unix seconds, `e` heel, `m` trim.
    static func compassSample(_ sample: AttitudeSample) -> [String: Any] {
        [
            "event": PhoneMessageEvent.compassSample.rawValue,
            "v": 2,
            "h": sample.headingDegrees ?? 0,
            "r": (sample.turnDegreesPerSecond * 10).rounded() / 10,
            "t": Int(sample.publishTimestamp),
            "e": sample.heelDegrees,
            "m": sample.displayTrimDegreesInt,
        ]
    }

    static func countdownSync(gunUnix: TimeInterval) -> [String: Any] {
        [
            "event": PhoneMessageEvent.countdownSync.rawValue,
            "running": true,
            "timestamp": gunUnix,
        ]
    }

    static func countdownHalt(remainingSeconds: Int) -> [String: Any] {
        [
            "event": PhoneMessageEvent.countdownSync.rawValue,
            "running": false,
            "remaining": remainingSeconds,
        ]
    }

    static func startTimerAck() -> [String: Any] {
        ["event": PhoneMessageEvent.startTimerAck.rawValue]
    }

    static func displayConfig(tier: DisplayTier) -> [String: Any] {
        [
            "event": PhoneMessageEvent.displayConfig.rawValue,
            "tier": tier.rawValue,
        ]
    }

    static func vmgUpdate(vmgKnots: Double, mode: VmgDisplayMode) -> [String: Any] {
        [
            "event": PhoneMessageEvent.vmgUpdate.rawValue,
            "vmg": (vmgKnots * 10).rounded() / 10,
            "mode": mode.rawValue,
        ]
    }

    static func parseWatchMessage(_ payload: Any) -> WatchInboundMessage? {
        guard let dictionary = payload as? [String: Any],
              let eventRaw = dictionary["event"] as? String else {
            return nil
        }

        switch eventRaw {
        case PhoneMessageEvent.startTimer.rawValue:
            guard let timestamp = dictionary["timestamp"] as? TimeInterval else {
                return nil
            }
            return .startTimer(timestamp: timestamp)

        case PhoneMessageEvent.countdownState.rawValue:
            let running = dictionary["running"] as? Bool ?? true
            if running {
                guard let timestamp = dictionary["timestamp"] as? TimeInterval else {
                    return nil
                }
                return .startTimer(timestamp: timestamp)
            }
            let remaining = dictionary["remaining"] as? Int ?? 0
            return .countdownHalted(remainingSeconds: max(0, remaining))

        case PhoneMessageEvent.screenSync.rawValue:
            guard let screenRaw = dictionary["screen"] as? String,
                  let screen = WatchMirroredScreen(rawValue: screenRaw) else {
                return nil
            }
            return .screenSync(screen)

        case PhoneMessageEvent.activityEnded.rawValue:
            return .activityEnded

        case PhoneMessageEvent.gpsSample.rawValue:
            let sog = parseDouble(dictionary["sog"]) ?? 0
            let hasFix = dictionary["has_fix"] as? Bool ?? false
            return .gpsSample(WatchGpsSample(
                sogKnots: sog,
                hasFix: hasFix,
                cogDegrees: parseDouble(dictionary["cog"])
            ))

        case PhoneMessageEvent.baseWindSet.rawValue:
            guard let degrees = parseDouble(dictionary["bwb"]) else {
                return nil
            }
            return .baseWindSet(degrees: degrees)

        default:
            return nil
        }
    }

    private static func parseDouble(_ value: Any?) -> Double? {
        if let doubleValue = value as? Double {
            return doubleValue
        }
        if let intValue = value as? Int {
            return Double(intValue)
        }
        if let numberValue = value as? NSNumber {
            return numberValue.doubleValue
        }
        return nil
    }
}
