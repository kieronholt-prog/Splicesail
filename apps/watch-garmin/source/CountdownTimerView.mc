import Toybox.Application;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;

//! Screen 1 — race countdown with bezel labels and pre-gun alerts.
class CountdownTimerView extends SailingBaseView {

    function initialize(state as SailingSensorState) {
        SailingBaseView.initialize(state);
    }

    function onShow() as Void {
        var app = Application.getApp() as SailingPerformanceApp;
        app.setCountdownView(self);
        SailingBaseView.onShow();
        app.syncGunCrossedFlag();
        app.syncPresetIfNotRunning();
    }

    function onHide() as Void {
        var app = Application.getApp() as SailingPerformanceApp;
        app.setCountdownView(null);
    }

    function onUpdate(dc as Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();

        var numFont = Graphics.FONT_NUMBER_THAI_HOT;
        var numH = Graphics.getFontHeight(numFont);
        var titleH = Graphics.getFontHeight(Graphics.FONT_XTINY);
        var cy = (h * 0.47).toNumber();

        CountdownSegmentBezel.draw(dc, w, h, cy, numH, titleH, mState.getBezelPreGunRemaining(), mState.getRaceTimerSeconds());
        drawMainTimer(dc, w, h);
        drawBezelLabels(dc, w, h);
        ActivityFeedback.draw(dc, w, h);
    }

    function onStartStopPress() as Boolean {
        var app = Application.getApp() as SailingPerformanceApp;
        app.clearCountdownExitArm();

        if (!mState.areControlsEnabled()) {
            mState.enableControls();
            app.syncPresetToPhone();
            WatchUi.requestUpdate();
            return true;
        }

        if (!mState.isCountdownRunning()) {
            return startOrResumeActivity();
        }

        return stopCountdownOnly();
    }

    function onIncreaseMinutes() as Boolean {
        if (!mState.canAdjustMinutes()) {
            return false;
        }
        mState.increaseMinutes();
        WatchUi.requestUpdate();
        return true;
    }

    function onDecreaseMinutes() as Boolean {
        if (!mState.canAdjustMinutes()) {
            return false;
        }
        mState.decreaseMinutes();
        WatchUi.requestUpdate();
        return true;
    }

    private function startOrResumeActivity() as Boolean {
        var app = Application.getApp() as SailingPerformanceApp;
        if (app.getRecorder().hasSession() && app.getRecorder().isPaused()) {
            if (!app.getRecorder().resumeSession()) {
                return false;
            }
            mState.resumeCountdown();
            app.onCountdownResumed();
            ActivityFeedback.showStart();
            WatchUi.requestUpdate();
            return true;
        }
        return beginActivityAndCountdown();
    }

    private function beginActivityAndCountdown() as Boolean {
        var app = Application.getApp() as SailingPerformanceApp;
        if (!app.getRecorder().startSession()) {
            System.println("Splice: activity session failed to start");
            WatchUi.requestUpdate();
            return true;
        }
        mState.startCountdown();
        app.onCountdownStarted();
        ActivityFeedback.showStart();
        WatchUi.requestUpdate();
        return true;
    }

    private function stopCountdownOnly() as Boolean {
        mState.haltCountdown();
        var app = Application.getApp() as SailingPerformanceApp;
        app.getRecorder().pauseSession();
        app.onCountdownHalted();
        CountdownAlerts.reset();
        ActivityFeedback.showStop();
        WatchUi.requestUpdate();
        return true;
    }

    private function drawMainTimer(dc as Dc, w as Number, h as Number) as Void {
        var cx = w / 2;
        var numFont = Graphics.FONT_NUMBER_THAI_HOT;
        var numH = Graphics.getFontHeight(numFont);
        var titleFont = Graphics.FONT_XTINY;
        var cy = (h * 0.47).toNumber();
        var titleY = cy - numH / 2 - 4;

        var timerSec = mState.getRaceTimerSeconds();

        var header = (mState.isElapsed() || GunCrossingSequence.isAnimPhase(timerSec)) ? "ELAPSED" : "COUNTDOWN";
        dc.setColor(SpliceTheme.TEXT_BLUE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, titleY, titleFont, header, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

        var line = formatTimer(mState.getRaceTimerSeconds());
        dc.drawText(cx, cy, numFont, line, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    private function drawBezelLabels(dc as Dc, w as Number, h as Number) as Void {
        var app = Application.getApp() as SailingPerformanceApp;
        var active = SpliceTheme.TEXT_BLUE;
        var dim = Graphics.COLOR_DK_GRAY;
        var canSync = mState.areControlsEnabled() && mState.canAdjustMinutes();

        BezelLabels.drawWordAtClock(dc, w, h, 120, "START", active);
        if (app.isCountdownExitArmed()) {
            BezelLabels.drawWordAtClock(dc, w, h, 60, "SAVE", active);
        } else {
            BezelLabels.drawWordAtClock(dc, w, h, 60, "BACK", active);
        }

        if (mState.areControlsEnabled()) {
            var syncColor = canSync ? active : dim;
            BezelLabels.drawSymbolAtClock(dc, w, h, 270, "+", syncColor);
            BezelLabels.drawSymbolAtClock(dc, w, h, 240, "-", syncColor);
            BezelLabels.drawWordAtClock(dc, w, h, 285, "SYNC", syncColor);
        }
    }

    private function formatTimer(timerSec as Number?) as String {
        if (timerSec == null) {
            var preset = mState.getDisplayMinutes() * 60;
            if (preset < 60) {
                return preset.format("%d");
            }
            return mState.getDisplayMinutes().format("%d") + ":00";
        }

        var absSec = timerSec < 0 ? -timerSec : timerSec;
        var preGun = timerSec < 0;

        if (preGun && absSec < 60) {
            return absSec.format("%d");
        }
        if (!preGun && absSec < 60) {
            return absSec.format("%d");
        }

        var m = absSec / 60;
        var s = absSec % 60;
        return m.format("%d") + ":" + s.format("%02d");
    }
}
