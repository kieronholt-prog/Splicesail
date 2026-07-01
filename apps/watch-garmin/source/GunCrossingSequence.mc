import Toybox.Lang;
import Toybox.System;

const GUN_NAV_SEC = 10;
const GUN_ANIM_STEP_MS = 100;
const GUN_ANIM_SEGMENTS = 12;

//! Post-gun elapsed bezel roll before Heading screen.
module GunCrossingSequence {

    var mActive = false;
    var mAnimStartMs = 0;

    function reset() as Void {
        mActive = false;
        mAnimStartMs = 0;
    }

    function start() as Void {
        mActive = true;
        mAnimStartMs = System.getTimer();
    }

    function isActive() as Boolean {
        return mActive;
    }

    function isAnimPhase(timerSec as Number?) as Boolean {
        return mActive && timerSec != null && timerSec >= 0 && timerSec < GUN_NAV_SEC;
    }

    function isComplete(timerSec as Number?) as Boolean {
        return mActive && timerSec != null && timerSec >= GUN_NAV_SEC;
    }

    //! Forward fill 0→11, then clockwise clear from segment 0.
    function isPostGunSegmentFilled(segmentIndex as Number) as Boolean {
        if (!mActive) {
            return false;
        }

        var t = System.getTimer() - mAnimStartMs;
        if (t < 0) {
            return false;
        }

        var step = t / GUN_ANIM_STEP_MS;
        var cycleSteps = GUN_ANIM_SEGMENTS * 2;
        var pos = step % cycleSteps;

        if (pos < GUN_ANIM_SEGMENTS) {
            return segmentIndex <= pos;
        }

        var clearedThrough = pos - GUN_ANIM_SEGMENTS;
        return segmentIndex > clearedThrough;
    }
}
