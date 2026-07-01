import Toybox.Lang;

//! Heading normalisation for display (0–359°).
module HeadingMath {

    function normalize(deg as Float) as Float {
        var n = (deg.toNumber() % 360).toFloat();
        if (n < 0) {
            n += 360.0;
        }
        return n;
    }

    function normalizeInt(deg as Float) as Number {
        return normalize(deg).toNumber();
    }
}
