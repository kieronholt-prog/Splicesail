import Toybox.Application;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;

//! Screen — horizontal split: SOG top, VMG bottom (Pro+ display from phone).
class SogView extends SailingBaseView {

    function initialize(state as SailingSensorState) {
        SailingBaseView.initialize(state);
    }

    function onShow() as Void {
        var app = Application.getApp() as SailingPerformanceApp;
        app.setSogView(self);
        SailingBaseView.onShow();
    }

    function onHide() as Void {
        var app = Application.getApp() as SailingPerformanceApp;
        app.setSogView(null);
    }

    function onUpdate(dc as Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var midY = h / 2;

        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();

        dc.setColor(Graphics.COLOR_DK_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawLine(8, midY, w - 8, midY);

        drawSogHalf(dc, w, 0, midY);
        drawVmgHalf(dc, w, midY, h);
        drawSpeedBezel(dc, w, h);
        ActivityFeedback.draw(dc, w, h);
    }

    private function drawSpeedBezel(dc as Dc, w as Number, h as Number) as Void {
        if (!allowsVmg()) {
            return;
        }
        BezelLabels.drawWordAtClock(dc, w, h, 120, "SET WIND", SpliceTheme.TEXT_BLUE);
    }

    private function allowsVmg() as Boolean {
        return DisplayTier.allowsVmg(mState.getDisplayTier());
    }

    private function drawSogHalf(dc as Dc, w as Number, top as Number, bottom as Number) as Void {
        var cx = w / 2;
        var halfH = bottom - top;
        var labelY = top + 8;
        var fontH = Graphics.getFontHeight(Graphics.FONT_NUMBER_HOT);
        var valueCy = top + 14 + (halfH - 14) / 2 - fontH / 4;
        dc.setColor(SpliceTheme.TEXT_BLUE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, labelY, Graphics.FONT_XTINY, "SOG", Graphics.TEXT_JUSTIFY_CENTER);

        if (!mState.hasGpsFix()) {
            var gps = (Application.getApp() as SailingPerformanceApp).getGps();
            var status = gps.isEnabled() ? "Acquiring GPS…" : "GPS unavailable";
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, valueCy, Graphics.FONT_SMALL, status, Graphics.TEXT_JUSTIFY_CENTER);
            return;
        }

        var sog = mState.getSogKnots().format("%.1f");
        dc.setColor(SpliceTheme.TEXT_BLUE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, valueCy, Graphics.FONT_NUMBER_HOT, sog, Graphics.TEXT_JUSTIFY_CENTER);
    }

    private function drawVmgHalf(dc as Dc, w as Number, top as Number, bottom as Number) as Void {
        var cx = w / 2;
        var halfH = bottom - top;
        var labelY = top + 8;
        var fontH = Graphics.getFontHeight(Graphics.FONT_NUMBER_HOT);
        var valueCy = top + 14 + (halfH - 14) / 2 - fontH / 4;
        var vmg = mState.getVmgDisplay();

        if (!allowsVmg()) {
            dc.setColor(SpliceTheme.TEXT_BLUE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, labelY, Graphics.FONT_XTINY, "VMG", Graphics.TEXT_JUSTIFY_CENTER);
            dc.setColor(Graphics.COLOR_DK_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, valueCy, Graphics.FONT_LARGE, "—", Graphics.TEXT_JUSTIFY_CENTER);
            return;
        }

        var label = vmg.isDownwind() ? "DW VMG" : "UW VMG";
        dc.setColor(SpliceTheme.TEXT_BLUE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, labelY, Graphics.FONT_XTINY, label, Graphics.TEXT_JUSTIFY_CENTER);

        if (!vmg.hasVmg()) {
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, valueCy, Graphics.FONT_SMALL, "Waiting for phone…", Graphics.TEXT_JUSTIFY_CENTER);
            return;
        }

        var knots = vmg.getVmgKnots();
        var magnitude = knots < 0.0 ? -knots : knots;
        var text = magnitude.format("%.1f");
        dc.setColor(SpliceTheme.TEXT_BLUE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, valueCy, Graphics.FONT_NUMBER_HOT, text, Graphics.TEXT_JUSTIFY_CENTER);
    }
}
