import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;

//! Turn dial hub on screen centreline; 0 at 3 o'clock; stbd up (red), port down (green).
module TurnRateDial {
    const MAX_DPS = 15.0;
    const TICK_STEP = 5.0;
    const ARC_PEN = 6;
    const TICK_PEN = 3;
    const ZERO_TICK_PEN = 4;
    const NEEDLE_PEN = 7;
    const HUB_RADIUS = 8;
    //! Labels sit just inside the arc band so they fit on round watches.
    const LABEL_INSET = 18;

    var mTickFont = null;
    var mUseRadialLabels = false;

    //! @param left Screen centreline X (hub); @param right Right edge of turn panel.
    function drawInRect(dc as Dc, left as Number, top as Number, right as Number, bottom as Number, turnDps as Float, showHeader as Boolean) as Void {
        var cx = left;
        var cy = (top + bottom) / 2;
        var panelH = bottom - top;
        var panelW = right - left;
        var radius = panelH / 2 - 22;
        if (radius > panelW - 12) {
            radius = panelW - 12;
        }
        if (radius < 36) {
            radius = 36;
        }

        ensureTickFont(dc);

        if (showHeader) {
            var gap = (panelW * 0.07).toNumber();
            if (gap < 8) {
                gap = 8;
            }
            dc.setColor(SpliceTheme.TEXT_BLUE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(right - gap, top + 10, Graphics.FONT_XTINY, "TURN", Graphics.TEXT_JUSTIFY_RIGHT);
        }

        dc.setClip(left, top, right - left, bottom - top);
        drawZones(dc, cx, cy, radius);
        drawArc(dc, cx, cy, radius);
        drawTicks(dc, cx, cy, radius);
        drawTickLabels(dc, cx, cy, radius);
        var needleR = (radius * 0.92).toNumber();
        drawNeedle(dc, cx, cy, needleR, turnDps);
        dc.setClip(0, 0, dc.getWidth(), dc.getHeight());
    }

    function ensureTickFont(dc as Dc) as Void {
        if (mTickFont != null) {
            return;
        }
        if (Graphics has :getVectorFont && dc has :drawRadialText) {
            mTickFont = Graphics.getVectorFont({
                :face => ["RobotoCondensedBold", "Roboto", "BionicBold"],
                :size => 12,
            });
            mUseRadialLabels = mTickFont != null;
        }
    }

    //! Red upper and green lower halves inside the right-opening gauge.
    function drawZones(dc as Dc, cx as Number, cy as Number, radius as Number) as Void {
        fillArcSector(dc, cx, cy, radius, 0, 90, Graphics.COLOR_DK_RED);
        fillArcSector(dc, cx, cy, radius, 270, 360, Graphics.COLOR_DK_GREEN);
    }

    function fillArcSector(dc as Dc, cx as Number, cy as Number, radius as Number, startDeg as Number, endDeg as Number, color as Number) as Void {
        var steps = 14;
        var count = steps + 2;
        var points = new [count];
        var span = endDeg - startDeg;
        if (span < 0) {
            span += 360;
        }
        points[0] = [cx, cy];
        for (var i = 0; i <= steps; i++) {
            var deg = startDeg + (span * i) / steps;
            if (deg >= 360) {
                deg -= 360;
            }
            var rad = deg * Math.PI / 180.0;
            points[i + 1] = [
                cx + (radius * Math.cos(rad)).toNumber(),
                cy - (radius * Math.sin(rad)).toNumber(),
            ];
        }
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.fillPolygon(points);
    }

    //! Right-opening semicircle centred on hub; 0° needle points to 3 o'clock.
    function drawArc(dc as Dc, cx as Number, cy as Number, radius as Number) as Void {
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(ARC_PEN);
        dc.drawArc(cx, cy, radius, Graphics.ARC_CLOCKWISE, 270, 90);
        dc.setPenWidth(1);
    }

    function drawTicks(dc as Dc, cx as Number, cy as Number, radius as Number) as Void {
        var tick = -MAX_DPS;
        while (tick <= MAX_DPS + 0.1) {
            var angle = needleAngle(tick);
            var rad = angle * Math.PI / 180.0;
            var outerR = radius;
            var innerR = radius - 16;
            var x1 = cx + (innerR * Math.cos(rad)).toNumber();
            var y1 = cy - (innerR * Math.sin(rad)).toNumber();
            var x2 = cx + (outerR * Math.cos(rad)).toNumber();
            var y2 = cy - (outerR * Math.sin(rad)).toNumber();
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.setPenWidth(tick == 0 ? ZERO_TICK_PEN : TICK_PEN);
            dc.drawLine(x1, y1, x2, y2);
            dc.setPenWidth(1);
            tick += TICK_STEP;
        }
    }

    function shouldDrawTickLabel(angle as Number) as Boolean {
        var rad = angle * Math.PI / 180.0;
        return Math.cos(rad) > 0.2;
    }

    function drawTickLabels(dc as Dc, cx as Number, cy as Number, radius as Number) as Void {
        var tick = -MAX_DPS;
        while (tick <= MAX_DPS + 0.1) {
            var angle = needleAngle(tick);
            var isEndpoint = tick == MAX_DPS || tick == -MAX_DPS;
            if (tick == 0) {
                tick += TICK_STEP;
                continue;
            }
            if (!isEndpoint && !shouldDrawTickLabel(angle)) {
                tick += TICK_STEP;
                continue;
            }
            var label = isEndpoint ? "…" : formatTickLabel(tick);
            var labelR = radius - LABEL_INSET;
            if (labelR < 20) {
                labelR = 20;
            }
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            if (mUseRadialLabels && !isEndpoint) {
                dc.drawRadialText(
                    cx,
                    cy,
                    mTickFont,
                    label,
                    Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER,
                    angle,
                    labelR,
                    radialDirection(angle)
                );
            } else {
                var rad = angle * Math.PI / 180.0;
                var lx = cx + (labelR * Math.cos(rad)).toNumber();
                var ly = cy - (labelR * Math.sin(rad)).toNumber();
                dc.drawText(lx, ly, Graphics.FONT_XTINY, label, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            }
            tick += TICK_STEP;
        }
    }

    function radialDirection(angle as Number) as RadialTextDirection {
        if (angle < 90 || angle > 270) {
            return Graphics.RADIAL_TEXT_DIRECTION_COUNTER_CLOCKWISE;
        }
        return Graphics.RADIAL_TEXT_DIRECTION_CLOCKWISE;
    }

    function formatTickLabel(tick as Float) as String {
        var value = tick;
        if (value < 0) {
            value = -value;
        }
        return value.toNumber().format("%d");
    }

    function drawNeedle(dc as Dc, cx as Number, cy as Number, radius as Number, turnDps as Float) as Void {
        var clamped = turnDps;
        if (clamped > MAX_DPS) {
            clamped = MAX_DPS;
        } else if (clamped < -MAX_DPS) {
            clamped = -MAX_DPS;
        }
        var angle = needleAngle(clamped);
        var rad = angle * Math.PI / 180.0;
        var tipX = cx + (radius * Math.cos(rad)).toNumber();
        var tipY = cy - (radius * Math.sin(rad)).toNumber();
        dc.setColor(Graphics.COLOR_YELLOW, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(NEEDLE_PEN);
        dc.drawLine(cx, cy, tipX, tipY);
        dc.fillCircle(cx, cy, HUB_RADIUS);
        dc.setPenWidth(1);
    }

    //! 0 → 3 o'clock; +stbd → 12 o'clock; −port → 6 o'clock.
    function needleAngle(turnDps as Float) as Number {
        var norm = turnDps / MAX_DPS;
        if (norm > 1.0) {
            norm = 1.0;
        } else if (norm < -1.0) {
            norm = -1.0;
        }
        if (norm >= 0) {
            return (360 - norm * 90).toNumber();
        }
        return (-norm * 90).toNumber();
    }
}
