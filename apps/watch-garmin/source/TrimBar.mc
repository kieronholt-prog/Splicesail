import Toybox.Graphics;
import Toybox.Lang;

//! Vertical trim bar — 0 at centre; up above, down below (2° steps, max 10°).
module TrimBar {
    const MAX_TRIM = 10.0;
    const STEP = 2.0;
    const SEGMENTS = 5;

    function draw(dc as Dc, left as Number, top as Number, right as Number, bottom as Number, trimDeg as Float, showHeader as Boolean) as Void {
        var panelW = right - left;
        var gap = (panelW * 0.07).toNumber();
        if (gap < 8) {
            gap = 8;
        }
        var labelHalf = 12;
        var labelX = right - gap - labelHalf;
        var barW = (panelW * 0.48).toNumber();
        if (barW > 144) {
            barW = 144;
        }
        if (barW < 14) {
            barW = 14;
        }
        var cx = labelX - gap - barW / 2;
        var cy = (top + bottom) / 2;
        var topMargin = 34;
        var bottomMargin = 28;
        var centerGap = 8;
        var usable = bottom - top - topMargin - bottomMargin - centerGap;
        var segH = usable / (SEGMENTS * 2);
        if (segH < 6) {
            segH = 6;
        }

        if (showHeader) {
            dc.setColor(SpliceTheme.TEXT_BLUE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(right - gap, top + 10, Graphics.FONT_XTINY, "TRIM", Graphics.TEXT_JUSTIFY_RIGHT);
        }

        for (var i = 1; i <= SEGMENTS; i++) {
            var threshold = i * STEP;
            var tickYUp = cy - centerGap / 2 - i * segH;
            var tickYDown = cy + centerGap / 2 + i * segH;
            var label = (i * STEP).toNumber().format("%d");

            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(labelX, tickYUp, Graphics.FONT_XTINY, label, Graphics.TEXT_JUSTIFY_RIGHT);
            dc.drawText(labelX, tickYDown, Graphics.FONT_XTINY, label, Graphics.TEXT_JUSTIFY_RIGHT);
            dc.setPenWidth(2);
            dc.drawLine(cx - barW / 2, tickYUp, cx + barW / 2, tickYUp);
            dc.drawLine(cx - barW / 2, tickYDown, cx + barW / 2, tickYDown);
            dc.setPenWidth(1);

            if (trimDeg >= threshold - 0.5) {
                dc.setColor(SpliceTheme.TEXT_BLUE, Graphics.COLOR_TRANSPARENT);
                dc.fillRectangle(cx - barW / 2, tickYUp - segH + 2, barW, segH - 3);
            }
            if (trimDeg <= -(threshold - 0.5)) {
                dc.setColor(SpliceTheme.TEXT_BLUE, Graphics.COLOR_TRANSPARENT);
                dc.fillRectangle(cx - barW / 2, tickYDown + 1, barW, segH - 3);
            }
        }
    }
}
