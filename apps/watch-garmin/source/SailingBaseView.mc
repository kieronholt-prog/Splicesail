import Toybox.Application;
import Toybox.Lang;
import Toybox.WatchUi;

//! Common BLE callbacks for all sailing screens.
class SailingBaseView extends WatchUi.View {

    protected var mState as SailingSensorState;

    function initialize(state as SailingSensorState) {
        View.initialize();
        mState = state;
    }

    function onShow() as Void {
        var app = Application.getApp() as SailingPerformanceApp;
        app.attachView(self);
        WatchUi.requestUpdate();
    }

    function setBleStatus(status) as Void {
        mState.setBleStatus(status);
        WatchUi.requestUpdate();
    }

    function onCompassSample(sample as Dictionary) as Void {
        mState.applySample(sample);
        var app = Application.getApp() as SailingPerformanceApp;
        app.noteCompassSample();
        app.getRecorder().recordSample(mState);
        WatchUi.requestUpdate();
    }

    function onBleDisconnected() as Void {
        mState.clearSample();
        mState.setBleStatus(:lost);
        WatchUi.requestUpdate();
    }

    function onChooseDevice() as Void {
        mState.clearSample();
        WatchUi.requestUpdate();
    }
}
