import Toybox.Graphics;
import Toybox.Lang;

//! Compass Box heading UI — countdown-style bezel + live heel bubble + centred heading.
class CompassBezelHelper {

    private const HEADING_STACK_TIGHTEN = 6;
    private const HEADING_BLOCK_DOWN = 6;
    private const HEEL_BUBBLE_RADIUS = 9;
    private const HEEL_MAX_DEG = 45.0;
    private const CENTER_CLOCK = 180;
    private const HEMISPHERE_CLOCK = 180;
    private const LABEL_15_CLOCK_STBD = 120;
    private const LABEL_15_CLOCK_PORT = 240;
    private const LABEL_30_CLOCK_STBD = 60;
    private const LABEL_30_CLOCK_PORT = 300;

    function initialize() {
    }

    function resetHistory() as Void {
    }

    function onSample(turnDps as Float, heelDeg as Float) as Void {
    }

    function draw(dc as Dc, w as Number, h as Number, headingDeg as Float, heelDeg as Float, hasSample as Boolean, statusMsg as String) as Void {
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();

        if (!hasSample) {
            drawStatus(dc, w, h, statusMsg);
            return;
        }

        CountdownSegmentBezel.drawStaticOutlined(dc, w, h);
        drawHeelScaleLabels(dc, w, h);
        drawHeelBubble(dc, w, h, heelDeg);
        drawHeadingCenter(dc, w, h, headingDeg);
    }

    private function drawStatus(dc as Dc, w as Number, h as Number, msg as String) as Void {
        dc.setColor(SpliceTheme.TEXT_BLUE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h / 2, Graphics.FONT_MEDIUM, msg, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    private function drawHeadingCenter(dc as Dc, w as Number, h as Number, headingDeg as Float) as Void {
        var cx = w / 2;
        var cy = h / 2;
        var geom = CountdownSegmentBezel.bezRadii(w, h);
        var rOuter = geom[3];
        var inner = rOuter - CountdownSegmentBezel.BEZEL_THICK - 18;
        var maxW = (inner * 2 * 0.85).toNumber();
        var titleH = Graphics.getFontHeight(Graphics.FONT_SMALL);
        var numFont = pickHeadingNumberFont(dc, maxW - 8, maxW - titleH + HEADING_STACK_TIGHTEN);
        var numH = Graphics.getFontHeight(numFont);
        var blockH = titleH + numH - HEADING_STACK_TIGHTEN;
        var blockTop = cy - blockH / 2 + HEADING_BLOCK_DOWN;

        dc.setColor(SpliceTheme.TEXT_BLUE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, blockTop + titleH / 2, Graphics.FONT_SMALL, "HEADING", Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

        var hdg = (headingDeg + 0.5).toNumber() % 360;
        dc.drawText(cx, blockTop + titleH + numH / 2 - HEADING_STACK_TIGHTEN, numFont, hdg.format("%03d"), Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    private function drawHeelScaleLabels(dc as Dc, w as Number, h as Number) as Void {
        drawHeelLabelAtClock(dc, w, h, LABEL_15_CLOCK_STBD, "15°");
        drawHeelLabelAtClock(dc, w, h, LABEL_15_CLOCK_PORT, "15°");
        drawHeelLabelAtClock(dc, w, h, LABEL_30_CLOCK_STBD, "30°");
        drawHeelLabelAtClock(dc, w, h, LABEL_30_CLOCK_PORT, "30°");
    }

    private function drawHeelLabelAtClock(dc as Dc, w as Number, h as Number, clockDeg as Number, text as String) as Void {
        var geom = CountdownSegmentBezel.bezRadii(w, h);
        var cx = geom[0];
        var cy = geom[1];
        var rInner = geom[2];
        var rOuter = geom[3];
        var r = rInner + (rOuter - rInner) * 2 / 3;
        var g = BezelLabels.clockToGarmin(clockDeg);
        var p = BezelLabels.arcPoint(cx, cy, r, g);

        dc.setColor(SpliceTheme.TEXT_BLUE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(p[0], p[1], Graphics.FONT_XTINY, text, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    private function drawHeelBubble(dc as Dc, w as Number, h as Number, heelDeg as Float) as Void {
        var geom = CountdownSegmentBezel.bezRadii(w, h);
        var cx = geom[0];
        var cy = geom[1];
        var rInner = geom[2];
        var rOuter = geom[3];
        var rMid = rInner + (rOuter - rInner) / 2;
        var g = heelToGarminDeg(heelDeg);
        var p = BezelLabels.arcPoint(cx, cy, rMid, g);

        dc.setColor(Graphics.COLOR_YELLOW, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(p[0], p[1], HEEL_BUBBLE_RADIUS);
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(2);
        dc.drawCircle(p[0], p[1], HEEL_BUBBLE_RADIUS);
        dc.setPenWidth(1);
    }

    //! 0° at 6 o'clock; each hemisphere spans 180° clock for 0–45° heel.
    private function heelToGarminDeg(heel as Float) as Number {
        var absHeel = heel < 0 ? -heel : heel;
        if (absHeel > HEEL_MAX_DEG) {
            absHeel = HEEL_MAX_DEG;
        }
        var arc = (absHeel / HEEL_MAX_DEG * HEMISPHERE_CLOCK).toNumber();
        var clock = heel >= 0 ? CENTER_CLOCK - arc : CENTER_CLOCK + arc;
        if (clock < 0) {
            clock += 360;
        } else if (clock >= 360) {
            clock -= 360;
        }
        return BezelLabels.clockToGarmin(clock);
    }

    private function pickHeadingNumberFont(dc as Dc, maxW as Number, maxH as Number) as FontDefinition {
        if (headingNumberFontFits(dc, Graphics.FONT_NUMBER_THAI_HOT, maxW, maxH)) { return Graphics.FONT_NUMBER_THAI_HOT; }
        if (headingNumberFontFits(dc, Graphics.FONT_NUMBER_HOT, maxW, maxH)) { return Graphics.FONT_NUMBER_HOT; }
        if (headingNumberFontFits(dc, Graphics.FONT_NUMBER_MEDIUM, maxW, maxH)) { return Graphics.FONT_NUMBER_MEDIUM; }
        return Graphics.FONT_NUMBER_MILD;
    }

    private function headingNumberFontFits(dc as Dc, font as FontDefinition, maxW as Number, maxH as Number) as Boolean {
        return Graphics.getFontHeight(font) <= maxH && dc.getTextWidthInPixels("888", font) + 4 <= maxW;
    }
}
