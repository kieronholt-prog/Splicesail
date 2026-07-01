import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;

//! Screen 2 — Compass Box heading UI (coloured bezels, no trim).
class HeadingHeelView extends SailingBaseView {

    private var _bezel as CompassBezelHelper;

    function initialize(state as SailingSensorState) {
        SailingBaseView.initialize(state);
        _bezel = new CompassBezelHelper();
    }

    function onUpdate(dc as Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var status = bleStatusText();
        _bezel.draw(dc, w, h, mState.getHeadingDeg(), mState.getHeelDeg(), mState.hasSample(), status);
        ActivityFeedback.draw(dc, w, h);
    }

    private function bleStatusText() as String {
        switch (mState.getBleStatus()) {
            case :waiting:
                return "Waiting for phone…";
            case :live:
                return "Waiting for data…";
            case :stale:
                return "Signal stale…";
            case :lost:
                return "Phone link lost";
            case :no_comms:
                return "No phone comms";
            case :sim_no_ble:
                return "No compass";
            default:
                return "No compass";
        }
    }
}
