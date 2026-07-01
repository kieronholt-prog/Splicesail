import Toybox.Application;
import Toybox.Lang;
import Toybox.WatchUi;

class ActivitySaveMenuDelegate extends WatchUi.Menu2InputDelegate {

    function initialize() {
        Menu2InputDelegate.initialize();
    }

    function onSelect(item as MenuItem) as Void {
        var app = Application.getApp() as SailingPerformanceApp;
        var id = item.getId();
        WatchUi.popView(WatchUi.SLIDE_DOWN);
        if (id == :save) {
            app.saveStoppedActivity();
            app.exitToMenu();
        } else if (id == :resume) {
            app.resumeStoppedActivity();
        } else if (id == :discard) {
            app.discardStoppedActivity();
            app.exitToMenu();
        }
    }

    function onBack() as Void {
        WatchUi.popView(WatchUi.SLIDE_DOWN);
    }
}
