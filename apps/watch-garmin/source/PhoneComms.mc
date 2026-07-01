import Toybox.Application;
import Toybox.Communications;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;

const PHONE_ACK_TIMEOUT_MS = 3000;
const PHONE_LINK_STALE_MS = 4000;

//! Watch ↔ phone via Garmin Connect IQ Mobile SDK (no custom BLE GATT).
module PhoneComms {

    var mPendingAck = false;
    var mAckDeadlineMs = 0;
    var mLastError = "";
    var mLinkStatus = :waiting;
    var mLastSampleMs = 0;

    function getLinkStatus() {
        return mLinkStatus;
    }

    function setLinkStatus(status) as Void {
        mLinkStatus = status;
        (Application.getApp() as SailingPerformanceApp).onPhoneLinkStatus(status);
    }

    function transmitStartTimer(timestampUnix as Number) as Void {
        if (!(Toybox has :Communications)) {
            mLastError = "No phone comms";
            return;
        }
        mPendingAck = true;
        mAckDeadlineMs = System.getTimer() + PHONE_ACK_TIMEOUT_MS;
        transmitPayload({
            "event" => "start_timer",
            "timestamp" => timestampUnix,
        });
    }

    function transmitCountdownState(running as Boolean, gunUnix as Number?, remaining as Number?) as Void {
        if (!(Toybox has :Communications)) {
            mLastError = "No phone comms";
            return;
        }
        if (running && gunUnix != null) {
            mPendingAck = true;
            mAckDeadlineMs = System.getTimer() + PHONE_ACK_TIMEOUT_MS;
            transmitPayload({
                "event" => "countdown_state",
                "running" => true,
                "timestamp" => gunUnix,
            });
            return;
        }
        if (!running && remaining != null) {
            transmitPayload({
                "event" => "countdown_state",
                "running" => false,
                "remaining" => remaining,
            });
        }
    }

    function transmitScreenSync(screenName as String) as Void {
        if (!(Toybox has :Communications)) {
            return;
        }
        transmitPayload({
            "event" => "screen_sync",
            "screen" => screenName,
        });
    }

    function transmitGpsSample(sogKnots as Float, hasFix as Boolean, cogDeg as Float?, hasCog as Boolean) as Void {
        if (!(Toybox has :Communications)) {
            return;
        }
        var payload = {
            "event" => "gps_sample",
            "sog" => sogKnots,
            "has_fix" => hasFix,
        } as Dictionary;

        if (hasCog && cogDeg != null) {
            payload["cog"] = cogDeg;
        }

        transmitPayload(payload);
    }

    //! Watch → phone: manual base-wind bearing (degrees true).
    function transmitBaseWindSet(headingDeg as Float) as Void {
        if (!(Toybox has :Communications)) {
            return;
        }
        transmitPayload({
            "event" => "base_wind_set",
            "bwb" => headingDeg,
        });
    }

    function transmitActivityEnded() as Void {
        if (!(Toybox has :Communications)) {
            return;
        }
        transmitPayload({
            "event" => "activity_ended",
        });
    }

    function transmitPayload(payload as Dictionary) as Void {
        if (!(Toybox has :Communications)) {
            return;
        }
        Communications.transmit(payload, null, new StartTimerListener());
    }

    function transmitStartTimerNow() as Void {
        transmitStartTimer(Time.now().value());
    }

    function pollAckTimeout() as Boolean {
        if (!mPendingAck || mAckDeadlineMs == 0) {
            return false;
        }
        if (System.getTimer() >= mAckDeadlineMs) {
            mPendingAck = false;
            mAckDeadlineMs = 0;
            mLastError = "Phone did not acknowledge";
            return true;
        }
        return false;
    }

    function pollLinkStale() as Boolean {
        if (mLinkStatus != :live) {
            return false;
        }
        if (mLastSampleMs == 0) {
            return false;
        }
        if (System.getTimer() - mLastSampleMs < PHONE_LINK_STALE_MS) {
            return false;
        }
        setLinkStatus(:stale);
        return true;
    }

    function clearErrors() as Void {
        mPendingAck = false;
        mAckDeadlineMs = 0;
        mLastError = "";
    }

    function getLastError() as String {
        return mLastError;
    }

    function hasPendingAck() as Boolean {
        return mPendingAck;
    }

    function handlePhoneAppMessage(message as Communications.PhoneAppMessage) as Void {
        var data = message.data;
        System.println("PhoneLink: inbound " + data);
        if (!(data instanceof Dictionary)) {
            System.println("PhoneLink: ignored — not a dictionary");
            return;
        }
        var dict = data as Dictionary;
        var event = dict.get("event");
        if (event == null) {
            event = dict["event"];
        }
        if (event == null) {
            System.println("PhoneLink: ignored — no event key");
            return;
        }

        var eventName = event instanceof String ? (event as String) : event.toString();

        if (eventName.equals("start_timer_ack")) {
            clearErrors();
            return;
        }

        if (eventName.equals("countdown_sync")) {
            handleCountdownSync(dict);
            return;
        }

        if (eventName.equals("countdown_state")) {
            handleCountdownSync(dict);
            return;
        }

        if (eventName.equals("compass_sample")) {
            System.println("PhoneLink: compass_sample received");
            handleCompassSample(dict);
            return;
        }

        if (eventName.equals("display_config")) {
            handleDisplayConfig(dict);
            return;
        }

        if (eventName.equals("vmg_update")) {
            handleVmgUpdate(dict);
            return;
        }

        System.println("PhoneLink: ignored event " + eventName);
    }

    function handlePhoneAppMessageError(error as Communications.PhoneAppMessageError) as Void {
        if (error == Communications.PHONE_APP_MESSAGE_ERROR_OUT_OF_MEMORY) {
            mLastError = "Phone message OOM";
        } else if (error == Communications.PHONE_APP_MESSAGE_ERROR_OUT_OF_STORAGE) {
            mLastError = "Phone message storage full";
        } else {
            mLastError = "Phone message error";
        }
        setLinkStatus(:lost);
    }

    function handleCountdownSync(dict as Dictionary) as Void {
        var running = dict.get("running");
        if (running == null) {
            running = dict["running"];
        }
        var isRunning = running != null && (running as Boolean);

        if (isRunning) {
            var timestamp = dict.get("timestamp");
            if (timestamp == null) {
                timestamp = dict["timestamp"];
            }
            if (timestamp == null) {
                System.println("PhoneLink: countdown_sync missing timestamp");
                return;
            }
            (Application.getApp() as SailingPerformanceApp).onPhoneCountdownSync(timestamp as Number);
            return;
        }

        var remaining = dict.get("remaining");
        if (remaining == null) {
            remaining = dict["remaining"];
        }
        var rem = remaining != null ? (remaining as Number) : 0;
        (Application.getApp() as SailingPerformanceApp).onPhoneCountdownHalted(rem);
    }

    function handleCompassSample(dict as Dictionary) as Void {
        mLastSampleMs = System.getTimer();
        setLinkStatus(:live);

        // v2 short keys: h heading, r turn °/min, e heel, m trim — legacy keys supported.
        var heading = dict.get("h");
        if (heading == null) {
            heading = dict["h"];
        }
        if (heading == null) {
            heading = dict.get("heading");
        }
        if (heading == null) {
            heading = dict["heading"];
        }

        var turn = dict.get("r");
        if (turn == null) {
            turn = dict["r"];
        }
        if (turn == null) {
            turn = dict.get("turn");
        }
        if (turn == null) {
            turn = dict["turn"];
        }

        var heel = dict.get("e");
        if (heel == null) {
            heel = dict["e"];
        }
        if (heel == null) {
            heel = dict.get("heel");
        }
        if (heel == null) {
            heel = dict["heel"];
        }

        var trim = dict.get("m");
        if (trim == null) {
            trim = dict["m"];
        }
        if (trim == null) {
            trim = dict.get("trim");
        }
        if (trim == null) {
            trim = dict["trim"];
        }

        var sample = {
            :headingDeg => heading != null ? (heading as Number).toFloat() : 0.0,
            :heelDeg => heel != null ? (heel as Number).toFloat() : 0.0,
            :trimDeg => trim != null ? (trim as Number).toFloat() : 0.0,
            :turnDps => turn != null ? (turn as Number).toFloat() : 0.0,
        };

        (Application.getApp() as SailingPerformanceApp).onPhoneCompassSample(sample);
    }

    function handleDisplayConfig(dict as Dictionary) as Void {
        var tier = dict.get("tier");
        if (tier == null) {
            tier = dict["tier"];
        }
        if (tier == null) {
            System.println("PhoneLink: display_config missing tier");
            return;
        }
        var tierName = tier instanceof String ? (tier as String) : tier.toString();
        (Application.getApp() as SailingPerformanceApp).onPhoneDisplayConfig(tierName);
    }

    function handleVmgUpdate(dict as Dictionary) as Void {
        mLastSampleMs = System.getTimer();
        setLinkStatus(:live);

        var vmg = dict.get("vmg");
        if (vmg == null) {
            vmg = dict["vmg"];
        }
        if (vmg == null) {
            System.println("PhoneLink: vmg_update missing vmg");
            return;
        }

        var mode = dict.get("mode");
        if (mode == null) {
            mode = dict["mode"];
        }
        var modeName = mode instanceof String ? (mode as String) : (mode != null ? mode.toString() : "upwind");
        var downwind = modeName.equals("downwind");

        (Application.getApp() as SailingPerformanceApp).onPhoneVmgUpdate((vmg as Number).toFloat(), downwind);
    }
}

class StartTimerListener extends Communications.ConnectionListener {

    function initialize() {
        ConnectionListener.initialize();
    }

    function onComplete() as Void {
        // Delivery to Garmin Connect Mobile only — phone ack arrives via handlePhoneAppMessage.
    }

    function onError() as Void {
        PhoneComms.clearErrors();
        PhoneComms.mLastError = "Transmit failed";
    }
}
