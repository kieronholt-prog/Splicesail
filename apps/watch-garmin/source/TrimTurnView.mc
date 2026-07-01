import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;

//! Screen 3 — trim bar (left) + turn dial (right); phone-filtered values only.
class TrimTurnView extends SailingBaseView {

    function initialize(state as SailingSensorState) {
        SailingBaseView.initialize(state);
    }

    function onUpdate(dc as Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var midX = w / 2;
        var cy = h / 2;
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();

        if (!mState.hasSample()) {
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w / 2, h / 2, Graphics.FONT_MEDIUM, "No compass", Graphics.TEXT_JUSTIFY_CENTER);
            ActivityFeedback.draw(dc, w, h);
            return;
        }

        dc.setColor(Graphics.COLOR_DK_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawLine(midX, 8, midX, h - 8);
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawLine(12, cy, w - 12, cy);

        drawHeader(dc, midX, w, h);
        TrimBar.draw(dc, 0, 8, midX, h - 8, mState.getTrimDeg(), false);
        TurnRateDial.drawInRect(dc, midX, 8, w, h - 8, mState.getTurnDps(), false);
        ActivityFeedback.draw(dc, w, h);
    }

    function drawHeader(dc as Dc, midX as Number, w as Number, h as Number) as Void {
        var gap = (midX * 0.07).toNumber();
        if (gap < 8) {
            gap = 8;
        }
        dc.setColor(SpliceTheme.TEXT_BLUE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(midX - gap, 12, Graphics.FONT_XTINY, "TRIM", Graphics.TEXT_JUSTIFY_RIGHT);
        dc.drawText(w - gap, 12, Graphics.FONT_XTINY, "TURN", Graphics.TEXT_JUSTIFY_RIGHT);
    }
}
