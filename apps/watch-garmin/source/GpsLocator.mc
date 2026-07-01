import Toybox.Lang;
import Toybox.Position;

const MPS_TO_KNOTS_GPS = 1.94384;

//! GNSS radio for live SOG (app open). FIT track still starts with the countdown session.
class GpsLocator {

    private var mEnabled = false;
    private var mSogKnots = 0.0;
    private var mHasFix = false;
    private var mCogDeg as Float? = null;

    function isEnabled() as Boolean {
        return mEnabled;
    }

    function enable() as Void {
        if (mEnabled || !(Toybox has :Position)) {
            return;
        }
        Position.enableLocationEvents(Position.LOCATION_CONTINUOUS, method(:onPosition));
        mEnabled = true;
    }

    function disable() as Void {
        if (!mEnabled || !(Toybox has :Position)) {
            return;
        }
        Position.enableLocationEvents(Position.LOCATION_DISABLE, null);
        mEnabled = false;
        mHasFix = false;
        mSogKnots = 0.0;
        mCogDeg = null;
    }

    function onPosition(info as Position.Info) as Void {
        if (info == null) {
            mHasFix = false;
            return;
        }

        mHasFix = hasUsableAccuracy(info.accuracy);

        if (info.speed != null && info.speed >= 0) {
            mSogKnots = info.speed * MPS_TO_KNOTS_GPS;
            mHasFix = true;
        }

        if (info.heading != null && info.heading >= 0) {
            mCogDeg = info.heading;
        }
    }

    function getCogDeg() as Float? {
        if (mCogDeg != null) {
            return mCogDeg;
        }
        if (!(Toybox has :Position)) {
            return null;
        }
        var posInfo = Position.getInfo();
        if (posInfo != null && posInfo.heading != null && posInfo.heading >= 0) {
            return posInfo.heading;
        }
        return null;
    }

    function hasCog() as Boolean {
        return getCogDeg() != null;
    }

    function getSogKnots() as Float {
        return mSogKnots;
    }

    function hasFix() as Boolean {
        return mHasFix;
    }

    private function hasUsableAccuracy(accuracy) as Boolean {
        if (accuracy == null) {
            return false;
        }
        return accuracy == Position.QUALITY_GOOD
            || accuracy == Position.QUALITY_USABLE
            || accuracy == Position.QUALITY_POOR;
    }
}
