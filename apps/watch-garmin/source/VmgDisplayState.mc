import Toybox.Lang;

//! Phone-computed VMG — watch display only (no calculation or history).
class VmgDisplayState {

    private var mHasVmg = false;
    private var mVmgKnots = 0.0;
    private var mDownwind = false;

    function applyPhoneUpdate(vmgKnots as Float, downwind as Boolean) as Void {
        mHasVmg = true;
        mVmgKnots = vmgKnots;
        mDownwind = downwind;
    }

    function clear() as Void {
        mHasVmg = false;
        mVmgKnots = 0.0;
        mDownwind = false;
    }

    function hasVmg() as Boolean {
        return mHasVmg;
    }

    function getVmgKnots() as Float {
        return mVmgKnots;
    }

    function isDownwind() as Boolean {
        return mDownwind;
    }
}
