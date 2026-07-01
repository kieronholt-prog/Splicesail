import Toybox.Activity;
import Toybox.Lang;
import Toybox.Math;
import Toybox.Sensor;

//! Watch magnetometer compass for base-wind capture (wind-set screen).
//!
//! Garmin compass APIs expose heading in RADIANS, not degrees:
//!   - Sensor.Info.heading        — magnetometer (preferred)
//!   - Activity.Info.currentHeading — compass during activity (fallback)
//! Do NOT use Position.Info.heading for aim-at-wind — that is direction of
//! travel (COG) when moving and jitters near 000° when stationary.
class WatchCompass {

    private var mActive = false;
    private var mHeadingDeg as Float? = null;

    function enable() as Void {
        mActive = true;
        refresh();
    }

    function disable() as Void {
        mActive = false;
    }

    function refresh() as Void {
        if (!mActive) {
            return;
        }
        var hdg = readCompassHeading();
        if (hdg != null) {
            mHeadingDeg = hdg;
        }
    }

    function getHeadingDeg() as Float {
        if (mHeadingDeg == null) {
            return 0.0;
        }
        return mHeadingDeg;
    }

    function hasHeading() as Boolean {
        return mHeadingDeg != null;
    }

    private function readCompassHeading() as Float? {
        if (Toybox has :Sensor) {
            var sensorInfo = Sensor.getInfo();
            if (sensorInfo != null && sensorInfo.heading != null) {
                return radiansToDegrees(sensorInfo.heading);
            }
        }

        if (Toybox has :Activity) {
            var activityInfo = Activity.getActivityInfo();
            if (activityInfo != null
                && activityInfo has :currentHeading
                && activityInfo.currentHeading != null) {
                return radiansToDegrees(activityInfo.currentHeading);
            }
        }

        return null;
    }

    private function radiansToDegrees(radians as Float) as Float {
        return HeadingMath.normalize(radians * 180.0 / Math.PI);
    }
}
