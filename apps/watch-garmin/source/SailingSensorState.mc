import Toybox.Lang;
import Toybox.Time;

const COUNTDOWN_MIN_MINUTES = 1;
const COUNTDOWN_MAX_MINUTES = 30;

//! Shared sensor + timer state for all watch screens.
class SailingSensorState {

    private var mBleStatus = :init;
    private var mHasSample = false;
    private var mHeadingDeg = 0.0;
    private var mHeelDeg = 0.0;
    private var mTrimDeg = 0.0;
    private var mTurnDps = 0.0;
    private var mSogKnots = 0.0;
    private var mHasGpsFix = false;
    private var mDisplayTier = DisplayTier.CORE;
    private var mStartGunUtc as Number? = null; //! Unix seconds (Time.now().value()) when gun fires.
    private var mDisplayMinutes = 5;
    private var mCountdownSeconds = 300;
    private var mCountdownRunning = false;
    private var mControlsEnabled = false;
    private var mPausedRemainingSec as Number? = null;
    private var mVmgDisplay as VmgDisplayState;

    function initialize() {
        mVmgDisplay = new VmgDisplayState();
    }

    function getVmgDisplay() as VmgDisplayState {
        return mVmgDisplay;
    }

    function setBleStatus(status) as Void {
        mBleStatus = status;
    }

    function getBleStatus() {
        return mBleStatus;
    }

    function setCountdownMinutes(minutes as Number) as Void {
        if (mCountdownRunning) {
            return;
        }
        mDisplayMinutes = clampMinutes(minutes);
        mCountdownSeconds = mDisplayMinutes * 60;
        mStartGunUtc = null;
        mPausedRemainingSec = null;
    }

    function canAdjustMinutes() as Boolean {
        return mControlsEnabled;
    }

    function getDisplayMinutes() as Number {
        return mDisplayMinutes;
    }

    function isCountdownRunning() as Boolean {
        return mCountdownRunning;
    }

    function isElapsed() as Boolean {
        if (!mCountdownRunning) {
            return false;
        }
        var timerSec = getRaceTimerSeconds();
        return timerSec != null && timerSec >= 0;
    }

    function areControlsEnabled() as Boolean {
        return mControlsEnabled;
    }

    function enableControls() as Void {
        mControlsEnabled = true;
    }

    function disableControls() as Void {
        mControlsEnabled = false;
    }

    function isCountdownHalted() as Boolean {
        return !mCountdownRunning && mPausedRemainingSec != null;
    }

    function increaseMinutes() as Void {
        if (!mControlsEnabled) {
            return;
        }
        syncAdjustPlus();
    }

    function decreaseMinutes() as Void {
        if (!mControlsEnabled) {
            return;
        }
        syncAdjustMinus();
    }

    //! + at :00/:59 adds a full minute (land on :00); otherwise rounds up.
    private function syncAdjustPlus() as Void {
        var rem = getPreGunRemainingSec();
        var secPart = rem % 60;
        var newRem = rem;

        if (secPart == 0) {
            newRem = rem + 60;
        } else if (secPart == 59) {
            newRem = rem + 1;
        } else {
            newRem = rem + (60 - secPart);
        }

        commitPreGunRemaining(newRem);
    }

    //! − at :00 removes a minute; otherwise zeros seconds to M:00.
    private function syncAdjustMinus() as Void {
        var rem = getPreGunRemainingSec();
        var secPart = rem % 60;
        var newRem = rem;

        if (secPart == 0) {
            newRem = rem - 60;
        } else {
            newRem = rem - secPart;
        }

        commitPreGunRemaining(newRem);
    }

    function getBezelPreGunRemaining() as Number? {
        if (mCountdownRunning) {
            var timerSec = getRaceTimerSeconds();
            if (timerSec != null && timerSec < 0) {
                return -timerSec;
            }
            return null;
        }
        if (mPausedRemainingSec != null) {
            return mPausedRemainingSec;
        }
        return null;
    }

    private function getPreGunRemainingSec() as Number {
        if (mCountdownRunning && mStartGunUtc != null) {
            var timerSec = getRaceTimerSeconds();
            if (timerSec != null && timerSec < 0) {
                return -timerSec;
            }
            return 0;
        }
        if (mPausedRemainingSec != null) {
            return mPausedRemainingSec;
        }
        return mCountdownSeconds;
    }

    private function commitPreGunRemaining(sec as Number) as Void {
        applyRemainingSeconds(sec);

        if (mCountdownRunning && mStartGunUtc != null) {
            mStartGunUtc = Time.now().value() + mCountdownSeconds;
            return;
        }
        if (mPausedRemainingSec != null) {
            mPausedRemainingSec = mCountdownSeconds;
        }
    }

    private function applyRemainingSeconds(sec as Number) as Void {
        mCountdownSeconds = clampSeconds(sec);
        mDisplayMinutes = (mCountdownSeconds + 59) / 60;
        if (mDisplayMinutes > COUNTDOWN_MAX_MINUTES) {
            mDisplayMinutes = COUNTDOWN_MAX_MINUTES;
        }
        if (mDisplayMinutes < COUNTDOWN_MIN_MINUTES) {
            mDisplayMinutes = COUNTDOWN_MIN_MINUTES;
        }
    }

    private function clampSeconds(sec as Number) as Number {
        var minSec = COUNTDOWN_MIN_MINUTES * 60;
        var maxSec = COUNTDOWN_MAX_MINUTES * 60;
        if (sec < minSec) {
            return minSec;
        }
        if (sec > maxSec) {
            return maxSec;
        }
        return sec;
    }

    function applySample(sample as Dictionary) as Void {
        mHasSample = true;
        mHeadingDeg = sample[:headingDeg];
        mHeelDeg = sample[:heelDeg];
        mTrimDeg = sample[:trimDeg];
        mTurnDps = sample[:turnDps];
    }

    function clearSample() as Void {
        mHasSample = false;
    }

    function hasSample() as Boolean {
        return mHasSample;
    }

    function getHeadingDeg() as Float {
        return mHeadingDeg;
    }

    function getHeelDeg() as Float {
        return mHeelDeg;
    }

    function getTrimDeg() as Float {
        return mTrimDeg;
    }

    function getTurnDps() as Float {
        return mTurnDps;
    }

    function setDisplayTier(tier as Number) as Void {
        mDisplayTier = tier;
    }

    function getDisplayTier() as Number {
        return mDisplayTier;
    }

    function applyGpsSample(sogKnots as Float, hasFix as Boolean) as Void {
        mSogKnots = sogKnots;
        mHasGpsFix = hasFix;
    }

    function getSogKnots() as Float {
        return mSogKnots;
    }

    function hasGpsFix() as Boolean {
        return mHasGpsFix;
    }

    function getStartGunUtc() as Number? {
        return mStartGunUtc;
    }

    function startCountdown() as Void {
        var duration = mCountdownSeconds;
        if (mPausedRemainingSec != null) {
            duration = mPausedRemainingSec;
        }
        mStartGunUtc = Time.now().value() + duration;
        mCountdownRunning = true;
        mPausedRemainingSec = null;
    }

    //! Stop countdown only — no save prompt; keeps halted remaining for resume.
    function haltCountdown() as Void {
        var timerSec = getRaceTimerSeconds();
        if (timerSec != null && timerSec < 0) {
            mPausedRemainingSec = -timerSec;
        } else if (timerSec != null && timerSec >= 0) {
            mPausedRemainingSec = 0;
        } else if (mPausedRemainingSec == null) {
            mPausedRemainingSec = mCountdownSeconds;
        }
        mStartGunUtc = null;
        mCountdownRunning = false;
    }

    function resumeCountdown() as Void {
        startCountdown();
    }

    function getPresetRemainingSeconds() as Number {
        if (mPausedRemainingSec != null) {
            return mPausedRemainingSec;
        }
        return mCountdownSeconds;
    }

    //! Apply gun Unix time from phone countdown_sync / countdown_state message.
    function applyGunUnix(gunUnix as Number) as Void {
        var nowUnix = Time.now().value();
        var delta = gunUnix - nowUnix;

        mCountdownRunning = true;
        mPausedRemainingSec = null;

        if (delta <= 0) {
            mStartGunUtc = gunUnix;
            mCountdownSeconds = 0;
            mDisplayMinutes = COUNTDOWN_MIN_MINUTES;
            return;
        }

        mCountdownSeconds = clampSeconds(delta);
        mDisplayMinutes = clampMinutes((mCountdownSeconds + 59) / 60);
        mStartGunUtc = gunUnix;
    }

    //! Apply halted preset from phone countdown_halt message.
    function applyHaltedPreset(remaining as Number) as Void {
        mCountdownRunning = false;
        mStartGunUtc = null;
        applyRemainingSeconds(remaining);
        mPausedRemainingSec = mCountdownSeconds;
    }

    function resetAfterActivityClosed() as Void {
        mStartGunUtc = null;
        mCountdownRunning = false;
        mPausedRemainingSec = null;
        mControlsEnabled = false;
    }

    function fireStartGun() as Void {
        mStartGunUtc = Time.now().value();
    }

    function getRaceTimerSeconds() as Number? {
        if (mStartGunUtc == null) {
            if (mPausedRemainingSec != null) {
                return -mPausedRemainingSec;
            }
            return null;
        }
        return Time.now().value() - mStartGunUtc;
    }

    function clampMinutes(minutes as Number) as Number {
        if (minutes < COUNTDOWN_MIN_MINUTES) {
            return COUNTDOWN_MIN_MINUTES;
        }
        if (minutes > COUNTDOWN_MAX_MINUTES) {
            return COUNTDOWN_MAX_MINUTES;
        }
        return minutes;
    }
}
