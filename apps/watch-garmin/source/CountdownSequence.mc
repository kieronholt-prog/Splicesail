import Toybox.Application;
import Toybox.Lang;

//! Countdown alert sequence — 5-4-1-GO or 3-2-1-GO (Garmin Connect + on-watch menu).
module CountdownSequence {

    const PROP_ID = "countdownSequence";
    const SEQ_541 = 0;
    const SEQ_321 = 1;

    function getId() as Number {
        var v = Application.Properties.getValue(PROP_ID);
        if (v != null && v == SEQ_321) {
            return SEQ_321;
        }
        return SEQ_541;
    }

    function setId(id as Number) as Void {
        Application.Properties.setValue(PROP_ID, id == SEQ_321 ? SEQ_321 : SEQ_541);
    }

    function defaultMinutes(id as Number) as Number {
        return id == SEQ_321 ? 3 : 5;
    }

    function getMinMinutes() as Number {
        return defaultMinutes(getId());
    }

    function getDefaultMinutes() as Number {
        return defaultMinutes(getId());
    }

    //! Whole-minute marks before gun for the active sequence.
    function getMinuteMarks() as Array<Number> {
        if (getId() == SEQ_321) {
            return [3, 2, 1] as Array<Number>;
        }
        return [5, 4, 1] as Array<Number>;
    }

    function labelForId(id as Number) as String {
        return id == SEQ_321 ? "3-2-1-GO" : "5-4-1-GO";
    }

    function label() as String {
        return labelForId(getId());
    }
}
