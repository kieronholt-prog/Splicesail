import Toybox.Attention;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;
import Toybox.WatchUi;

const FEEDBACK_MS = 1500;
const BEZEL_WIDTH = 14;

//! Garmin-style start/stop flash — coloured bezel + centre icon, tone, vibration.
module ActivityFeedback {

    var mMode = :none;
    var mDeadlineMs = 0;

    function showStart() as Void {
        mMode = :start;
        mDeadlineMs = System.getTimer() + FEEDBACK_MS;
        playCue(true);
        WatchUi.requestUpdate();
    }

    function showStop() as Void {
        mMode = :stop;
        mDeadlineMs = System.getTimer() + FEEDBACK_MS;
        playCue(false);
        WatchUi.requestUpdate();
    }

    function isActive() as Boolean {
        if (mMode == :none) {
            return false;
        }
        if (System.getTimer() >= mDeadlineMs) {
            mMode = :none;
            return false;
        }
        return true;
    }

    function tick() as Void {
        if (mMode != :none && System.getTimer() >= mDeadlineMs) {
            mMode = :none;
            WatchUi.requestUpdate();
        }
    }

    function draw(dc as Dc, w as Number, h as Number) as Void {
        if (!isActive()) {
            return;
        }

        var color = mMode == :start ? Graphics.COLOR_GREEN : Graphics.COLOR_RED;
        drawBezelRing(dc, w, h, color);
        if (mMode == :start) {
            drawPlayIcon(dc, w, h, color);
        } else {
            drawStopIcon(dc, w, h, color);
        }
    }

    function playCue(start as Boolean) as Void {
        if (Attention has :playTone) {
            Attention.playTone(start ? Attention.TONE_START : Attention.TONE_STOP);
        }
        if (Attention has :vibrate) {
            Attention.vibrate([new Attention.VibeProfile(100, 200)]);
        }
    }

    function drawBezelRing(dc as Dc, w as Number, h as Number, color as Number) as Void {
        var cx = w / 2;
        var cy = h / 2;
        var r = (w < h ? w : h) / 2 - BEZEL_WIDTH / 2 - 2;
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(BEZEL_WIDTH);
        dc.drawArc(cx, cy, r, Graphics.ARC_CLOCKWISE, 0, 180);
        dc.drawArc(cx, cy, r, Graphics.ARC_CLOCKWISE, 180, 360);
        dc.setPenWidth(1);
    }

    function drawPlayIcon(dc as Dc, w as Number, h as Number, color as Number) as Void {
        var cx = w / 2;
        var cy = h / 2;
        var s = (w * 0.14).toNumber();
        if (s < 28) {
            s = 28;
        }
        var pts = [
            [cx - s / 2, cy - s],
            [cx + s, cy],
            [cx - s / 2, cy + s],
        ] as Array<[Numeric, Numeric]>;
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.fillPolygon(pts);
    }

    function drawStopIcon(dc as Dc, w as Number, h as Number, color as Number) as Void {
        var cx = w / 2;
        var cy = h / 2;
        var s = (w * 0.12).toNumber();
        if (s < 24) {
            s = 24;
        }
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.fillRectangle(cx - s / 2, cy - s / 2, s, s);
    }
}
