import Toybox.Application;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;
import Toybox.WatchUi;

const BASE_WIND_REFRESH_MS = 250;

//! Full-screen base-wind capture — phone (BOAT) or watch compass (WATCH).
class BaseWindSetView extends SailingBaseView {

    //! Radial bezel labels: on-device visual ≈ (180 − clockDeg).
    const BEZEL_SAVE_CLOCK = 120; //! 2 o'clock — Start/Stop (SAVE WIND).
    const BEZEL_SOURCE_CLOCK = 270; //! 9 o'clock — menu (WATCH/BOAT).
    const BEZEL_EXIT_CLOCK = 60; //! 4 o'clock — bottom-right exit.

    private var _watchCompass as WatchCompass;
    private var _useWatchCompass = false;
    private var _frozen = false;
    private var _frozenHeading = 0.0;
    private var _lastRefreshMs = 0;

    function initialize(state as SailingSensorState, compass as WatchCompass) {
        SailingBaseView.initialize(state);
        _watchCompass = compass;
    }

    function onShow() as Void {
        SailingBaseView.onShow();
        _lastRefreshMs = 0;
        if (_useWatchCompass) {
            _watchCompass.enable();
        }
        WatchUi.requestUpdate();
    }

    function onHide() as Void {
        _watchCompass.disable();
        (Application.getApp() as SailingPerformanceApp).reattachCurrentScreenView();
    }

    function onUpdate(dc as Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();

        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();

        refreshHeadingIfDue();

        drawHeadingValue(dc, w, h);
        drawBezel(dc, w, h);
        ActivityFeedback.draw(dc, w, h);

        if (!_frozen) {
            WatchUi.requestUpdate();
        }
    }

    function onCompassSample(sample as Dictionary) as Void {
        SailingBaseView.onCompassSample(sample);
        if (!_frozen && !_useWatchCompass) {
            WatchUi.requestUpdate();
        }
    }

    function toggleSource() as Boolean {
        if (_frozen) {
            return true;
        }
        _useWatchCompass = !_useWatchCompass;
        if (_useWatchCompass) {
            _watchCompass.enable();
        } else {
            _watchCompass.disable();
        }
        WatchUi.requestUpdate();
        return true;
    }

    function onStartStopPress() as Boolean {
        if (_frozen) {
            _frozen = false;
            WatchUi.requestUpdate();
            return true;
        }

        if (!hasLiveHeading()) {
            return true;
        }

        _frozenHeading = currentHeading();
        _frozen = true;
        PhoneComms.transmitBaseWindSet(_frozenHeading);
        WatchUi.requestUpdate();
        return true;
    }

    function onExitPress() as Boolean {
        _watchCompass.disable();
        WatchUi.popView(WatchUi.SLIDE_RIGHT);
        return true;
    }

    function isFrozen() as Boolean {
        return _frozen;
    }

    private function refreshHeadingIfDue() as Void {
        if (_frozen) {
            return;
        }

        var now = System.getTimer();
        if (_lastRefreshMs != 0 && (now - _lastRefreshMs) < BASE_WIND_REFRESH_MS) {
            return;
        }
        _lastRefreshMs = now;

        if (_useWatchCompass) {
            _watchCompass.refresh();
        }
    }

    private function drawHeadingValue(dc as Dc, w as Number, h as Number) as Void {
        var cx = w / 2;
        var lineH = Graphics.getFontHeight(Graphics.FONT_XTINY);
        var headerY1 = (h * 0.14).toNumber();
        var headerY2 = headerY1 + lineH + lineH;
        var currentBearingY = (h * 0.54).toNumber();
        var previousBearingY = h / 2 + 10;
        var bearingY = (currentBearingY + previousBearingY) / 2;
        var source = _useWatchCompass ? "WATCH HDG" : "BOAT HDG";
        var color = _frozen ? Graphics.COLOR_RED : SpliceTheme.TEXT_BLUE;

        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, headerY1, Graphics.FONT_XTINY, "BASE WIND", Graphics.TEXT_JUSTIFY_CENTER);
        dc.drawText(cx, headerY2, Graphics.FONT_XTINY, source, Graphics.TEXT_JUSTIFY_CENTER);

        if (_useWatchCompass && !_frozen) {
            WindSetDial.draw(
                dc,
                w,
                h,
                HeadingMath.normalize(_watchCompass.getHeadingDeg()),
                _watchCompass.hasHeading(),
                bearingY
            );
        }

        if (!_frozen && !hasLiveHeading()) {
            var msg = _useWatchCompass ? "Acquiring compass…" : "Waiting for phone…";
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, bearingY, Graphics.FONT_SMALL, msg, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            return;
        }

        var heading = _frozen ? _frozenHeading : currentHeading();
        var text = HeadingMath.normalizeInt(heading);

        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, bearingY, Graphics.FONT_NUMBER_HOT, text.format("%03d"), Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    private function drawBezel(dc as Dc, w as Number, h as Number) as Void {
        var active = SpliceTheme.TEXT_BLUE;
        var sourceLabel = _useWatchCompass ? "BOAT" : "WATCH";
        BezelLabels.drawWordAtClock(dc, w, h, BEZEL_SOURCE_CLOCK, sourceLabel, active);
        BezelLabels.drawWordAtClock(dc, w, h, BEZEL_SAVE_CLOCK, "SAVE WIND", active);
        BezelLabels.drawWordAtClock(dc, w, h, BEZEL_EXIT_CLOCK, "EXIT", active);
    }

    private function hasLiveHeading() as Boolean {
        if (_useWatchCompass) {
            return _watchCompass.hasHeading();
        }
        return mState.hasSample();
    }

    private function currentHeading() as Float {
        if (_useWatchCompass) {
            return _watchCompass.getHeadingDeg();
        }
        return HeadingMath.normalize(mState.getHeadingDeg());
    }
}
