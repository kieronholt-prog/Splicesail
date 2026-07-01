import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;

//! Curved labels on the watch bezel (clock position → screen).
module BezelLabels {

    const LABEL_INSET = 32;
    const LABEL_FONT_SIZE = 18;
    const SYMBOL_FONT_SIZE = 30;
    const SYMBOL_FONT = Graphics.FONT_LARGE;
    const WORD_FONT = Graphics.FONT_SMALL;

    var mLabelFont = null;
    var mSymbolFont = null;
    var mUseRadialText = false;

    //! Clock face degrees clockwise from 12 o'clock.
    function clockToGarmin(clockDeg as Number) as Number {
        return (270 + clockDeg) % 360;
    }

    function labelRadius(w as Number, h as Number) as Number {
        var d = w < h ? w : h;
        return d / 2 - LABEL_INSET;
    }

    function labelFontHeight(dc as Dc) as Number {
        ensureFonts(dc);
        if (mLabelFont != null) {
            return Graphics.getFontHeight(mLabelFont);
        }
        return Graphics.getFontHeight(WORD_FONT);
    }

    function wordFont(dc as Dc) as FontDefinition {
        ensureFonts(dc);
        return mLabelFont != null ? mLabelFont : WORD_FONT;
    }

    function ensureFonts(dc as Dc) as Void {
        if (mLabelFont != null) {
            return;
        }
        if (Graphics has :getVectorFont && dc has :drawRadialText) {
            mLabelFont = Graphics.getVectorFont({
                :face => ["RobotoCondensedBold", "Roboto", "BionicBold"],
                :size => LABEL_FONT_SIZE
            });
            mSymbolFont = Graphics.getVectorFont({
                :face => ["RobotoCondensedBold", "Roboto", "BionicBold"],
                :size => SYMBOL_FONT_SIZE
            });
            mUseRadialText = mLabelFont != null;
        }
    }

    //! Readable along the outer edge (matches CompassBox data field logic).
    function radialDirection(clockDeg as Number) as RadialTextDirection {
        if (clockDeg > 90 && clockDeg < 270) {
            return Graphics.RADIAL_TEXT_DIRECTION_CLOCKWISE;
        }
        return Graphics.RADIAL_TEXT_DIRECTION_COUNTER_CLOCKWISE;
    }

    //! Radial labels (START/BACK/SYNC): on-device visual clock ≈ (180 - clockDeg).
    //! Flat symbols (+/−): visual clock ≈ clockDeg.
    function drawWordAtClock(dc as Dc, w as Number, h as Number, clockDeg as Number, text as String, color as Number) as Void {
        drawWordAtClockOffset(dc, w, h, clockDeg, text, color, 0, 0);
    }

    //! clockOffset corrects radial-text centre vs flat placement on device.
    //! radiusMode: 0 = default (label + half font height), 1 = flat label radius.
    function drawWordAtClockOffset(dc as Dc, w as Number, h as Number, clockDeg as Number, text as String, color as Number, clockOffset as Number, radiusMode as Number) as Void {
        var drawDeg = (clockDeg + clockOffset + 360) % 360;
        var cx = w / 2;
        var cy = h / 2;
        var rBase = labelRadius(w, h);
        ensureFonts(dc);
        var g = clockToGarmin(drawDeg);
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);

        if (mUseRadialText) {
            var fontH = Graphics.getFontHeight(mLabelFont);
            var r = radiusMode == 1 ? rBase : rBase + fontH / 2;
            dc.drawRadialText(
                cx,
                cy,
                mLabelFont,
                text,
                Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER,
                g,
                r,
                radialDirection(drawDeg)
            );
            return;
        }

        var p = arcPoint(cx, cy, rBase, g);
        dc.drawText(p[0], p[1], wordFont(dc), text, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    function drawFlatWordAtClock(dc as Dc, w as Number, h as Number, clockDeg as Number, text as String, color as Number) as Void {
        var cx = w / 2;
        var cy = h / 2;
        var r = labelRadius(w, h);
        var g = clockToGarmin(clockDeg);
        var p = arcPoint(cx, cy, r, g);
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.drawText(p[0], p[1], wordFont(dc), text, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    //! Flat +/− at label radius — between word labels and FONT_LARGE.
    function drawSymbolAtClock(dc as Dc, w as Number, h as Number, clockDeg as Number, text as String, color as Number) as Void {
        var cx = w / 2;
        var cy = h / 2;
        var r = labelRadius(w, h);
        var g = clockToGarmin(clockDeg);
        var p = arcPoint(cx, cy, r, g);
        ensureFonts(dc);
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        var font = mSymbolFont != null ? mSymbolFont : SYMBOL_FONT;
        dc.drawText(p[0], p[1], font, text, Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    function arcPoint(cx as Number, cy as Number, r as Number, garminDeg as Number) as [Number, Number] {
        var rad = garminDeg * Math.PI / 180.0;
        return [cx + (r * Math.cos(rad)).toNumber(), cy + (r * Math.sin(rad)).toNumber()];
    }
}
