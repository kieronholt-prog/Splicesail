import Toybox.Application;
import Toybox.Lang;
import Toybox.WatchUi;

//! Quatix 7 Pro — left up/down navigates; countdown sync when controls armed.
class SailingPerformanceDelegate extends WatchUi.BehaviorDelegate {

    private var _physicalStartStop as Boolean = false;
    private var _physicalBack as Boolean = false;

    function initialize() {
        BehaviorDelegate.initialize();
    }

    //! Quatix middle-left — sequence menu or left-up (nav / +1 min).
    function onMenu() as Boolean {
        var app = Application.getApp() as SailingPerformanceApp;
        if (app.shouldShowSequenceSettings()) {
            app.showSequenceMenu();
            return true;
        }
        return handleLeftUp();
    }

    function onPreviousPage() as Boolean {
        return handleLeftUp();
    }

    function onNextPage() as Boolean {
        return handleLeftDown();
    }

    //! Bottom-right — disable countdown controls, then exit.
    function onBack() as Boolean {
        if (blockCountdownTouch()) {
            if (_physicalBack) {
                _physicalBack = false;
                return handleBottomRight();
            }
            return true;
        }
        return handleBottomRight();
    }

    //! AMOLED — Start/Stop maps to onSelect.
    function onSelect() as Boolean {
        var app = Application.getApp() as SailingPerformanceApp;
        if (isSogSetScreen(app)) {
            if (_physicalStartStop) {
                _physicalStartStop = false;
            }
            app.sogSetBaseWindPress();
            return true;
        }
        if (!app.isCountdownScreen()) {
            return false;
        }
        if (_physicalStartStop) {
            _physicalStartStop = false;
            return app.countdownStartStop();
        }
        return true;
    }

    function onTap(clickEvent as WatchUi.ClickEvent) as Boolean {
        if (isCountdownScreen()) {
            return true;
        }
        return false;
    }

    function onSwipe(swipeEvent as WatchUi.SwipeEvent) as Boolean {
        if (blockCountdownSwipe()) {
            return true;
        }
        var app = Application.getApp() as SailingPerformanceApp;
        var direction = swipeEvent.getDirection();
        if (direction == WatchUi.SWIPE_LEFT) {
            app.showNextScreen();
            return true;
        }
        if (direction == WatchUi.SWIPE_RIGHT) {
            app.showPreviousScreen();
            return true;
        }
        return false;
    }

    //! Button-down arrives before onSelect/onBack on 5-button AMOLED watches.
    function onKeyPressed(keyEvent as WatchUi.KeyEvent) as Boolean {
        var app = Application.getApp() as SailingPerformanceApp;
        if (app.isCountdownScreen()) {
            return captureCountdownPhysicalKey(keyEvent.getKey());
        }
        if (isSogSetScreen(app) && isStartStopKey(keyEvent.getKey())) {
            _physicalStartStop = true;
            return true;
        }
        return false;
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
        if (isLeftUpKey(key)) {
            return handleLeftUp();
        }
        if (isLeftDownKey(key)) {
            return handleLeftDown();
        }
        if (isStartStopKey(key)) {
            var app = Application.getApp() as SailingPerformanceApp;
            if (app.isCountdownScreen()) {
                _physicalStartStop = true;
                return app.countdownStartStop();
            }
            if (isSogSetScreen(app)) {
                return app.sogSetBaseWindPress();
            }
        }
        if (isExitKey(key)) {
            if (isCountdownScreen() && blockCountdownTouch()) {
                _physicalBack = true;
            }
            return handleBottomRight();
        }
        return false;
    }

    private function isCountdownScreen() as Boolean {
        var app = Application.getApp() as SailingPerformanceApp;
        return app.isCountdownScreen();
    }

    //! SOG screen with SET bezel (Pro+ VMG).
    private function isSogSetScreen(app as SailingPerformanceApp) as Boolean {
        return app.isSogScreen()
            && DisplayTier.allowsVmg(app.getState().getDisplayTier());
    }

    private function captureCountdownPhysicalKey(key as Number) as Boolean {
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

    private function blockCountdownTouch() as Boolean {
        var app = Application.getApp() as SailingPerformanceApp;
        return app.isCountdownScreen() && app.getState().isCountdownRunning();
    }

    private function blockCountdownSwipe() as Boolean {
        var app = Application.getApp() as SailingPerformanceApp;
        if (!app.isCountdownScreen() || !app.getState().isCountdownRunning()) {
            return false;
        }
        if (app.isCountdownExitArmed() || app.getState().isElapsed()) {
            return false;
        }
        return true;
    }

    private function shouldSyncCountdownMinutes() as Boolean {
        var app = Application.getApp() as SailingPerformanceApp;
        if (!app.isCountdownScreen()) {
            return false;
        }
        if (!app.getState().areControlsEnabled()) {
            return false;
        }
        if (app.isCountdownExitArmed()) {
            return false;
        }
        if (app.getState().isElapsed()) {
            return false;
        }
        return true;
    }

    private function handleLeftUp() as Boolean {
        var app = Application.getApp() as SailingPerformanceApp;
        if (shouldSyncCountdownMinutes()) {
            app.countdownIncrease();
            return true;
        }
        app.clearCountdownExitArm();
        app.showPreviousScreen();
        return true;
    }

    private function handleLeftDown() as Boolean {
        var app = Application.getApp() as SailingPerformanceApp;
        if (shouldSyncCountdownMinutes()) {
            app.countdownDecrease();
            return true;
        }
        app.clearCountdownExitArm();
        app.showNextScreen();
        return true;
    }

    private function handleBottomRight() as Boolean {
        var app = Application.getApp() as SailingPerformanceApp;

        if (app.isCountdownScreen()) {
            if (app.getState().areControlsEnabled()) {
                app.disableCountdownControls();
                return true;
            }
            if (app.getRecorder().hasSession()) {
                if (!app.isCountdownExitArmed()) {
                    app.armCountdownExit();
                    return true;
                }
                app.clearCountdownExitArm();
                app.showActivitySaveMenu();
                return true;
            }
            app.exitToMenu();
            return true;
        }

        if (app.isSogScreen()) {
            app.showPreviousScreen();
            return true;
        }

        if (app.getRecorder().hasSession()) {
            app.showActivitySaveMenu();
            return true;
        }
        app.exitToMenu();
        return true;
    }

    private function isLeftUpKey(key as Number) as Boolean {
        return key == WatchUi.KEY_UP || key == WatchUi.KEY_UP_LEFT || key == WatchUi.KEY_MENU;
    }

    private function isLeftDownKey(key as Number) as Boolean {
        return key == WatchUi.KEY_DOWN || key == WatchUi.KEY_DOWN_LEFT;
    }

    private function isStartStopKey(key as Number) as Boolean {
        return key == WatchUi.KEY_START || key == WatchUi.KEY_UP_RIGHT || key == WatchUi.KEY_ENTER;
    }

    private function isExitKey(key as Number) as Boolean {
        return key == WatchUi.KEY_ESC || key == WatchUi.KEY_DOWN_RIGHT;
    }
}
