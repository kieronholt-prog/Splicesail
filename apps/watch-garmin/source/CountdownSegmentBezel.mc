import Toybox.Graphics;
import Toybox.Lang;

//! Countdown segment ring — stbd green / port red, animated in the last two minutes.
module CountdownSegmentBezel {

    const BEZEL_THICK = 27;
    const OUTLINE_PEN = 4;
    const SEGMENT_COUNT = 12;
    const SEGMENT_DEG = 30;
    const GAP_DEG = 4;
    const LABEL_CLEARANCE = 4;
    const FILL_STEPS = 8;
    const PHASE_STEP_SEC = 5;

    const OUTLINE_FIRST_AT = 115;
    const OUTLINE_LAST_AT = 60;
    const FILL_FIRST_AT = 55;
    const FILL_LAST_AT = 0;

    const RADIAL_TRIM = 2;

    function bezRadii(w as Number, h as Number) as [Number, Number, Number, Number] {
        var cx = w / 2;
        var cy = h / 2;
        var labelR = BezelLabels.labelRadius(w, h);
        var rOuter = labelR - LABEL_CLEARANCE;
        var rInner = rOuter - BEZEL_THICK;
        return [cx, cy, rInner, rOuter];
    }

    //! Stbd-green / port-red outlines only — used on the heading screen.
    function drawStaticOutlined(dc as Dc, w as Number, h as Number) as Void {
        var geom = bezRadii(w, h);
        var cx = geom[0];
        var cy = geom[1];
        var rInner = geom[2];
        var rOuter = geom[3];

        if (rOuter <= rInner + 8) {
            return;
        }

        drawGapSeparators(dc, cx, cy, rInner, rOuter);

        var halfGap = GAP_DEG / 2;
        for (var i = 0; i < SEGMENT_COUNT; i += 1) {
            var c0 = i * SEGMENT_DEG + halfGap;
            var c1 = (i + 1) * SEGMENT_DEG - halfGap;
            var g0 = BezelLabels.clockToGarmin(c0);
            var g1 = BezelLabels.clockToGarmin(c1);
            var sideColor = segmentSideColor(i);
            drawSegmentOutline(dc, cx, cy, rInner, rOuter, g0, g1, sideColor);
        }

        dc.setPenWidth(1);
    }

    function draw(dc as Dc, w as Number, h as Number, timerCy as Number, numH as Number, titleH as Number, preGunRem as Number?, raceSec as Number?) as Void {
        var geom = bezRadii(w, h);
        var cx = geom[0];
        var cy = geom[1];
        var rInner = geom[2];
        var rOuter = geom[3];

        if (rOuter <= rInner + 8) {
            return;
        }

        drawGapSeparators(dc, cx, cy, rInner, rOuter);

        if (GunCrossingSequence.isAnimPhase(raceSec)) {
            drawPostGunAnim(dc, cx, cy, rInner, rOuter);
        } else {
            drawPreGun(dc, cx, cy, rInner, rOuter, preGunRem != null ? preGunRem : -1);
        }

        dc.setPenWidth(1);
    }

    function drawPreGun(dc as Dc, cx as Number, cy as Number, rInner as Number, rOuter as Number, rem as Number) as Void {
        var coloredOutlines = coloredOutlineCount(rem);
        var filled = filledSegmentCount(rem);
        var halfGap = GAP_DEG / 2;

        for (var i = 0; i < SEGMENT_COUNT; i += 1) {
            var c0 = i * SEGMENT_DEG + halfGap;
            var c1 = (i + 1) * SEGMENT_DEG - halfGap;
            var g0 = BezelLabels.clockToGarmin(c0);
            var g1 = BezelLabels.clockToGarmin(c1);
            var sideColor = segmentSideColor(i);
            var isFilled = i < filled;
            var outlineColor = SpliceTheme.TEXT_BLUE;

            if (isFilled) {
                outlineColor = sideColor;
                drawSegmentFill(dc, cx, cy, rInner, rOuter, g0, g1, sideColor);
            } else if (i < coloredOutlines) {
                outlineColor = sideColor;
            }

            drawSegmentOutline(dc, cx, cy, rInner, rOuter, g0, g1, outlineColor);
        }
    }

    function drawPostGunAnim(dc as Dc, cx as Number, cy as Number, rInner as Number, rOuter as Number) as Void {
        var halfGap = GAP_DEG / 2;

        for (var i = 0; i < SEGMENT_COUNT; i += 1) {
            var c0 = i * SEGMENT_DEG + halfGap;
            var c1 = (i + 1) * SEGMENT_DEG - halfGap;
            var g0 = BezelLabels.clockToGarmin(c0);
            var g1 = BezelLabels.clockToGarmin(c1);
            var sideColor = segmentSideColor(i);
            var outlineColor = SpliceTheme.TEXT_BLUE;

            if (GunCrossingSequence.isPostGunSegmentFilled(i)) {
                outlineColor = sideColor;
                drawSegmentFill(dc, cx, cy, rInner, rOuter, g0, g1, sideColor);
            }

            drawSegmentOutline(dc, cx, cy, rInner, rOuter, g0, g1, outlineColor);
        }
    }

    //! Stbd (right) green 000–180°; port (left) red 180–360° clockwise from 12.
    function segmentSideColor(segmentIndex as Number) as Number {
        var centerClock = segmentIndex * SEGMENT_DEG + SEGMENT_DEG / 2;
        if (centerClock < 180) {
            return Graphics.COLOR_GREEN;
        }
        return Graphics.COLOR_RED;
    }

    function coloredOutlineCount(rem as Number) as Number {
        if (rem < 0) {
            return 0;
        }
        if (rem < OUTLINE_LAST_AT) {
            return SEGMENT_COUNT;
        }
        if (rem > OUTLINE_FIRST_AT) {
            return 0;
        }
        return (OUTLINE_FIRST_AT - rem) / PHASE_STEP_SEC + 1;
    }

    function filledSegmentCount(rem as Number) as Number {
        if (rem < 0 || rem > FILL_FIRST_AT) {
            return 0;
        }
        return (FILL_FIRST_AT - rem) / PHASE_STEP_SEC + 1;
    }

    //! Filled bands for inner/outer rims plus radial caps — arcs match segment colour.
    function drawSegmentOutline(dc as Dc, cx as Number, cy as Number, rInner as Number, rOuter as Number, g0 as Number, g1 as Number, color as Number) as Void {
        if (g0 >= g1) {
            return;
        }

        var inset = OUTLINE_PEN / 2;
        var ri = rInner + inset;
        var ro = rOuter - inset;
        var pw = OUTLINE_PEN;

        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        fillAnnularSector(dc, cx, cy, ro - pw, ro, g0, g1, color);
        fillAnnularSector(dc, cx, cy, ri, ri + pw, g0, g1, color);

        var radRo = ro - pw + RADIAL_TRIM;
        var radRi = ri + pw - RADIAL_TRIM;
        if (radRo <= radRi) {
            radRo = ro;
            radRi = ri;
        }

        dc.setPenWidth(OUTLINE_PEN);
        var o0 = BezelLabels.arcPoint(cx, cy, radRo, g0);
        var i0 = BezelLabels.arcPoint(cx, cy, radRi, g0);
        dc.drawLine(i0[0], i0[1], o0[0], o0[1]);

        var o1 = BezelLabels.arcPoint(cx, cy, radRo, g1);
        var i1 = BezelLabels.arcPoint(cx, cy, radRi, g1);
        dc.drawLine(i1[0], i1[1], o1[0], o1[1]);
    }

    function drawSegmentFill(dc as Dc, cx as Number, cy as Number, rInner as Number, rOuter as Number, g0 as Number, g1 as Number, color as Number) as Void {
        if (g0 >= g1) {
            return;
        }

        var inset = OUTLINE_PEN / 2;
        fillAnnularSector(dc, cx, cy, rInner + inset + OUTLINE_PEN, rOuter - inset - OUTLINE_PEN, g0, g1, color);
    }

    function fillAnnularSector(dc as Dc, cx as Number, cy as Number, rInner as Number, rOuter as Number, a0 as Number, a1 as Number, color as Number) as Void {
        if (a0 >= a1 || rOuter <= rInner) {
            return;
        }

        var pts = [] as Array<[Numeric, Numeric]>;
        var i = 0;
        for (i = 0; i <= FILL_STEPS; i += 1) {
            var a = a0 + (a1 - a0) * i / FILL_STEPS;
            var p = BezelLabels.arcPoint(cx, cy, rOuter, a);
            pts.add([p[0], p[1]]);
        }
        for (i = FILL_STEPS; i >= 0; i -= 1) {
            var a2 = a0 + (a1 - a0) * i / FILL_STEPS;
            var p2 = BezelLabels.arcPoint(cx, cy, rInner, a2);
            pts.add([p2[0], p2[1]]);
        }
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.fillPolygon(pts);
    }

    function drawGapSeparators(dc as Dc, cx as Number, cy as Number, rInner as Number, rOuter as Number) as Void {
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(OUTLINE_PEN + 4);

        for (var i = 0; i < SEGMENT_COUNT; i += 1) {
            var g = BezelLabels.clockToGarmin(i * SEGMENT_DEG);
            var o = BezelLabels.arcPoint(cx, cy, rOuter + OUTLINE_PEN, g);
            var inn = BezelLabels.arcPoint(cx, cy, rInner - OUTLINE_PEN, g);
            dc.drawLine(inn[0], inn[1], o[0], o[1]);
        }
    }
}
