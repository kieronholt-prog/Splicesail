import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;

//! Rotating compass ring for watch-heading wind-set mode.
module WindSetDial {

    //! Garmin screen coords: 0° = 3 o'clock; north (compass 0°) = 270°.
    const NORTH_GARMIN_DEG = 270.0;

    function draw(dc as Dc, w as Number, h as Number, headingDeg as Float, hasHeading as Boolean, centerY as Number) as Void {
        var cx = w / 2;
        var cy = centerY;
        var radius = (w < h ? w : h) / 2 - 38;

        dc.setColor(Graphics.COLOR_DK_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(2);
        dc.drawCircle(cx, cy, radius);
        dc.setPenWidth(1);

        if (!hasHeading) {
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, cy, Graphics.FONT_SMALL, "Acquiring compass…", Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            return;
        }

        drawRotatingRing(dc, cx, cy, radius, headingDeg);
        drawFixedArrow(dc, cx, cy, radius);
    }

    function drawRotatingRing(dc as Dc, cx as Number, cy as Number, radius as Number, headingDeg as Float) as Void {
        for (var i = 0; i < 72; i += 1) {
            var bearing = i * 5.0 - headingDeg;
            var rad = compassBearingToRad(bearing);
            var major = i % 9 == 0;
            var inner = major ? radius - 20 : radius - 10;
            var x0 = cx + (radius * Math.cos(rad)).toNumber();
            var y0 = cy + (radius * Math.sin(rad)).toNumber();
            var x1 = cx + (inner * Math.cos(rad)).toNumber();
            var y1 = cy + (inner * Math.sin(rad)).toNumber();
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.setPenWidth(major ? 2 : 1);
            dc.drawLine(x0, y0, x1, y1);
        }
        dc.setPenWidth(1);

        var cardinals = ["N", "E", "S", "W"];
        for (var c = 0; c < 4; c += 1) {
            var bearing = c * 90.0 - headingDeg;
            var cRad = compassBearingToRad(bearing);
            var tx = cx + ((radius - 28) * Math.cos(cRad)).toNumber();
            var ty = cy + ((radius - 28) * Math.sin(cRad)).toNumber();
            var isNorth = c == 0;
            dc.setColor(isNorth ? Graphics.COLOR_RED : Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(tx, ty, Graphics.FONT_SMALL, cardinals[c], Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
        }
    }

    function drawFixedArrow(dc as Dc, cx as Number, cy as Number, radius as Number) as Void {
        var tipY = cy - radius + 12;
        dc.setColor(Graphics.COLOR_RED, Graphics.COLOR_TRANSPARENT);
        dc.fillPolygon([
            [cx, tipY - 16],
            [cx - 10, tipY + 6],
            [cx + 10, tipY + 6],
        ]);
    }

    function compassBearingToRad(bearingDeg as Float) as Float {
        var garminDeg = (NORTH_GARMIN_DEG + bearingDeg).toNumber() % 360;
        if (garminDeg < 0) {
            garminDeg += 360;
        }
        return garminDeg * Math.PI / 180.0;
    }
}
