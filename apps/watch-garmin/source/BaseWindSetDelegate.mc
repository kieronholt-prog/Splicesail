import Toybox.Lang;
import Toybox.WatchUi;

//! Input for base-wind set screen — SET / EXIT / BOAT↔WATCH.
class BaseWindSetDelegate extends WatchUi.BehaviorDelegate {

    private var _view as BaseWindSetView;
    private var _physicalStartStop = false;
    private var _physicalBack = false;

    function initialize(view as BaseWindSetView) {
        BehaviorDelegate.initialize();
        _view = view;
    }

    function onSwipe(swipeEvent as WatchUi.SwipeEvent) as Boolean {
        return true;
    }

    function onMenu() as Boolean {
        return _view.toggleSource();
    }

    function onPreviousPage() as Boolean {
        return _view.toggleSource();
    }

    function onBack() as Boolean {
        if (_physicalBack) {
            _physicalBack = false;
        }
        return _view.onExitPress();
    }

    function onSelect() as Boolean {
        if (_physicalStartStop) {
            _physicalStartStop = false;
            return _view.onStartStopPress();
        }
        return true;
    }

    function onKeyPressed(keyEvent as WatchUi.KeyEvent) as Boolean {
        return capturePhysicalKey(keyEvent.getKey());
    }

    function onKeyReleased(keyEvent as WatchUi.KeyEvent) as Boolean {
        var key = keyEvent.getKey();
        if (isStartStopKey(key)) {
            _physicalStartStop = false;
        }
        if (isExitKey(key)) {
            _physicalBack = false;
        }
        return false;
    }

    function onKey(keyEvent as WatchUi.KeyEvent) as Boolean {
        var key = keyEvent.getKey();
        if (isMenuKey(key)) {
            return _view.toggleSource();
        }
        if (isStartStopKey(key)) {
            _physicalStartStop = true;
            return _view.onStartStopPress();
        }
        if (isExitKey(key)) {
            return _view.onExitPress();
        }
        return false;
    }

    private function capturePhysicalKey(key as Number) as Boolean {
        if (isStartStopKey(key)) {
            _physicalStartStop = true;
            return true;
        }
        if (isExitKey(key)) {
            _physicalBack = true;
            return true;
        }
        return false;
    }

    private function isMenuKey(key as Number) as Boolean {
        return key == WatchUi.KEY_MENU || key == WatchUi.KEY_UP_LEFT;
    }

    private function isStartStopKey(key as Number) as Boolean {
        return key == WatchUi.KEY_START || key == WatchUi.KEY_UP_RIGHT || key == WatchUi.KEY_ENTER;
    }

    private function isExitKey(key as Number) as Boolean {
        return key == WatchUi.KEY_ESC || key == WatchUi.KEY_DOWN_RIGHT;
    }
}
