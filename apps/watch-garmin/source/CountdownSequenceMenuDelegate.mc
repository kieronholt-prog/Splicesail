import Toybox.Application;
import Toybox.Lang;
import Toybox.WatchUi;

class CountdownSequenceMenuDelegate extends WatchUi.Menu2InputDelegate {

    function initialize() {
        Menu2InputDelegate.initialize();
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
        var app = Application.getApp() as SailingPerformanceApp;
        var id = item.getId();
        if (id == CountdownSequence.SEQ_541) {
            app.applyCountdownSequence(CountdownSequence.SEQ_541);
        } else if (id == CountdownSequence.SEQ_321) {
            app.applyCountdownSequence(CountdownSequence.SEQ_321);
        }
        WatchUi.popView(WatchUi.SLIDE_DOWN);
    }

    function onBack() as Void {
        WatchUi.popView(WatchUi.SLIDE_DOWN);
    }
}
