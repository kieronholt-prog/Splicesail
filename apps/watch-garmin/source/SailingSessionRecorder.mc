import Toybox.Activity;
import Toybox.ActivityRecording;
import Toybox.FitContributor;
import Toybox.Lang;
import Toybox.System;

const FIT_SAMPLE_MS = 1000;

//! SPORT_SAILING session with CompassBox developer fields.
class SailingSessionRecorder {

    private var mSession as ActivityRecording.Session or Null = null;
    private var mHeadingField as FitContributor.Field or Null = null;
    private var mHeelField as FitContributor.Field or Null = null;
    private var mTrimField as FitContributor.Field or Null = null;
    private var mTurnField as FitContributor.Field or Null = null;
    private var mFieldsReady = false;
    private var mLastFitMs = 0;
    private var mPaused = false;

    function hasSession() as Boolean {
        return mSession != null;
    }

    function isRecording() as Boolean {
        return mSession != null && mSession.isRecording();
    }

    function isPaused() as Boolean {
        return mPaused;
    }

    function startSession() as Boolean {
        if (mSession != null && mSession.isRecording()) {
            return true;
        }
        if (mSession == null) {
            mSession = ActivityRecording.createSession({
                :sport => Activity.SPORT_SAILING,
                :name => "Splice",
                :recordLocation => true,
            });
            if (mSession == null) {
                return false;
            }
            ensureFitFields();
        }
        if (!mSession.start()) {
            return false;
        }
        mPaused = false;
        return true;
    }

    //! Stop recording but keep session for save / resume / discard.
    function pauseSession() as Void {
        if (mSession != null && mSession.isRecording()) {
            mSession.stop();
            mPaused = true;
        }
    }

    function resumeSession() as Boolean {
        if (mSession == null) {
            return false;
        }
        if (!mSession.start()) {
            return false;
        }
        mPaused = false;
        return true;
    }

    function saveSession() as Boolean {
        if (mSession == null) {
            return false;
        }
        if (mSession.isRecording()) {
            mSession.stop();
        }
        var ok = mSession.save();
        clearSession();
        return ok;
    }

    function discardSession() as Boolean {
        if (mSession == null) {
            return false;
        }
        if (mSession.isRecording()) {
            mSession.stop();
        }
        var ok = mSession.discard();
        clearSession();
        return ok;
    }

    private function clearSession() as Void {
        mSession = null;
        mPaused = false;
        mFieldsReady = false;
        mHeadingField = null;
        mHeelField = null;
        mTrimField = null;
        mTurnField = null;
    }

    function ensureFitFields() as Void {
        if (mFieldsReady || mSession == null) {
            return;
        }
        if (!(mSession has :createField)) {
            return;
        }
        mHeadingField = mSession.createField(
            "Compass HDG",
            CompassProtocol.FIT_FIELD_HEADING,
            FitContributor.DATA_TYPE_FLOAT,
            { :mesgType => FitContributor.MESG_TYPE_RECORD, :units => "deg" }
        );
        mHeelField = mSession.createField(
            "Compass Heel",
            CompassProtocol.FIT_FIELD_HEEL,
            FitContributor.DATA_TYPE_FLOAT,
            { :mesgType => FitContributor.MESG_TYPE_RECORD, :units => "deg" }
        );
        mTrimField = mSession.createField(
            "Compass Trim",
            CompassProtocol.FIT_FIELD_TRIM,
            FitContributor.DATA_TYPE_FLOAT,
            { :mesgType => FitContributor.MESG_TYPE_RECORD, :units => "deg" }
        );
        mTurnField = mSession.createField(
            "Compass Turn",
            CompassProtocol.FIT_FIELD_TURN,
            FitContributor.DATA_TYPE_FLOAT,
            { :mesgType => FitContributor.MESG_TYPE_RECORD, :units => "deg/s" }
        );
        mFieldsReady = true;
    }

    function recordSample(state as SailingSensorState) as Void {
        if (!isRecording() || !mFieldsReady || !state.hasSample()) {
            return;
        }
        var now = System.getTimer();
        if (now - mLastFitMs < FIT_SAMPLE_MS) {
            return;
        }
        mLastFitMs = now;

        if (mHeadingField != null) {
            mHeadingField.setData(state.getHeadingDeg());
        }
        if (mHeelField != null) {
            mHeelField.setData(state.getHeelDeg());
        }
        if (mTrimField != null) {
            mTrimField.setData(state.getTrimDeg());
        }
        if (mTurnField != null) {
            mTurnField.setData(state.getTurnDps());
        }
    }
}
