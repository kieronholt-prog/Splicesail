import Toybox.Lang;
import Toybox.System;

//! Simulator detection + FIT field IDs shared with session recorder.
module CompassProtocol {
    const FIT_FIELD_HEADING = 0;
    const FIT_FIELD_HEEL = 1;
    const FIT_FIELD_TRIM = 2;
    const FIT_FIELD_TURN = 3;

    function isSimulator() as Boolean {
        var settings = System.getDeviceSettings();
        return settings.uniqueIdentifier == null;
    }
}
