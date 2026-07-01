import Toybox.Application;
import Toybox.Activity;
import Toybox.Communications;
import Toybox.Lang;
import Toybox.Position;
import Toybox.System;
import Toybox.Time;
import Toybox.Timer;
import Toybox.WatchUi;

//! Screen indices — left up/down navigates in this order.
module SpliceScreens {
    const COUNTDOWN = 0;
    const HEADING_HEEL = 1;
    const TRIM_TURN = 2;
    const SOG = 3;
    const COUNT = 4;
}

const APP_TICK_MS = 1000;
const MPS_TO_KNOTS = 1.94384;
const PRE_GUN_FAST_MS = 50;
const PRE_GUN_FAST_REM = 2;
const PHONE_LINK_RETRY_MS = 10000;
const PHONE_SAMPLE_STALE_MS = 4000;

class SailingPerformanceApp extends Application.AppBase {

    private var _state as SailingSensorState;
    private var _recorder as SailingSessionRecorder;
    private var _gps as GpsLocator;
    private var _view as SailingBaseView?;
    private var _screenIndex = SpliceScreens.COUNTDOWN;
    private var _countdownView as CountdownTimerView?;
    private var _sogView as SogView?;
    private var _appTickTimer as Timer.Timer?;
    private var _gunCrossed = false;
    private var _gunSeqTimer as Timer.Timer?;
    private var _preGunFastTimer as Timer.Timer?;
    private var _preGunFastActive = false;
    private var _lastPhoneLinkRetryMs = 0;
    private var _lastSampleMs = 0;
    private var _countdownBackArmed = false;
    private var _loadedSequence = CountdownSequence.SEQ_541;

    private var _phoneMessagesRegistered = false;
    private var _uiReady = false;
    private var _cachedViews as Array<SailingBaseView>?;
    private var _navDelegate as SailingPerformanceDelegate?;
    private var _watchCompass as WatchCompass;

    function initialize() {
        AppBase.initialize();
        _state = new SailingSensorState();
        _recorder = new SailingSessionRecorder();
        _gps = new GpsLocator();
        _watchCompass = new WatchCompass();
        loadSettings();
        applyDisplayTier(DisplayTier.loadFromProperties());
    }

    function onStart(state as Dictionary?) as Void {
        registerPhoneMessagesOnce();
        enableGps();
        if (!CompassProtocol.isSimulator()) {
            PhoneComms.setLinkStatus(:waiting);
        }
        ensureAppTick();
        syncScreenToPhone(_screenIndex);
        syncPresetIfNotRunning();
    }

    function onStop(state as Dictionary?) as Void {
        stopAppTick();
        stopGunSeqTimer();
        stopPreGunFastTimer();
        disableGps();
    }

    function enableGps() as Void {
        if (CompassProtocol.isSimulator()) {
            return;
        }
        _gps.enable();
    }

    function disableGps() as Void {
        _gps.disable();
        _state.applyGpsSample(0.0, false);
    }

    function getGps() as GpsLocator {
        return _gps;
    }

    function getInitialView() as [Views] or [Views, InputDelegates] {
        return [getCachedView(SpliceScreens.COUNTDOWN), getNavDelegate()];
    }

    function getState() as SailingSensorState {
        return _state;
    }

    function getRecorder() as SailingSessionRecorder {
        return _recorder;
    }

    function getScreenIndex() as Number {
        return _screenIndex;
    }

    function isCountdownScreen() as Boolean {
        return _screenIndex == SpliceScreens.COUNTDOWN;
    }

    function setCountdownView(view as CountdownTimerView?) as Void {
        _countdownView = view;
    }

    function setSogView(view as SogView?) as Void {
        _sogView = view;
    }

    function isSogScreen() as Boolean {
        return _screenIndex == SpliceScreens.SOG;
    }

    function onPhoneVmgUpdate(vmgKnots as Float, downwind as Boolean) as Void {
        _state.getVmgDisplay().applyPhoneUpdate(vmgKnots, downwind);
        if (_screenIndex == SpliceScreens.SOG && _view != null) {
            WatchUi.requestUpdate();
        }
    }

    function showBaseWindSet() as Void {
        if (!DisplayTier.allowsVmg(_state.getDisplayTier())) {
            return;
        }
        var view = new BaseWindSetView(_state, _watchCompass);
        WatchUi.pushView(view, new BaseWindSetDelegate(view), WatchUi.SLIDE_LEFT);
    }

    function sogSetBaseWindPress() as Boolean {
        if (!DisplayTier.allowsVmg(_state.getDisplayTier())) {
            return false;
        }
        showBaseWindSet();
        return true;
    }

    function countdownIncrease() as Boolean {
        var changed = false;
        if (_countdownView != null) {
            changed = _countdownView.onIncreaseMinutes();
        }
        if (changed) {
            if (_state.isCountdownRunning()) {
                syncGunToPhone();
            } else if (_state.areControlsEnabled()) {
                syncPresetToPhone();
            }
        }
        return changed;
    }

    function countdownDecrease() as Boolean {
        var changed = false;
        if (_countdownView != null) {
            changed = _countdownView.onDecreaseMinutes();
        }
        if (changed) {
            if (_state.isCountdownRunning()) {
                syncGunToPhone();
            } else if (_state.areControlsEnabled()) {
                syncPresetToPhone();
            }
        }
        return changed;
    }

    function countdownStartStop() as Boolean {
        if (_countdownView != null) {
            return _countdownView.onStartStopPress();
        }
        return activityStartStop();
    }

    //! Start/stop when countdown view is not attached (e.g. SOG screen).
    function activityStartStop() as Boolean {
        if (!_state.areControlsEnabled()) {
            _state.enableControls();
            syncPresetToPhone();
            WatchUi.requestUpdate();
            return true;
        }

        if (!_state.isCountdownRunning()) {
            if (_recorder.hasSession() && _recorder.isPaused()) {
                if (!_recorder.resumeSession()) {
                    return false;
                }
                _state.resumeCountdown();
                onCountdownResumed();
                ActivityFeedback.showStart();
                WatchUi.requestUpdate();
                return true;
            }
            if (!_recorder.startSession()) {
                WatchUi.requestUpdate();
                return true;
            }
            _state.startCountdown();
            onCountdownStarted();
            ActivityFeedback.showStart();
            WatchUi.requestUpdate();
            return true;
        }

        _state.haltCountdown();
        _recorder.pauseSession();
        onCountdownHalted();
        CountdownAlerts.reset();
        ActivityFeedback.showStop();
        WatchUi.requestUpdate();
        return true;
    }

    function onCountdownStarted() as Void {
        _gunCrossed = false;
        _countdownBackArmed = false;
        CountdownAlerts.reset();
        PhoneComms.clearErrors();
        syncGunCrossedFlag();
        syncGunToPhone();
        ensureAppTick();
    }

    function onCountdownResumed() as Void {
        _countdownBackArmed = false;
        CountdownAlerts.reset();
        PhoneComms.clearErrors();
        syncGunCrossedFlag();
        syncGunToPhone();
        ensureAppTick();
    }

    function syncGunToPhone() as Void {
        var timerSec = _state.getRaceTimerSeconds();
        if (timerSec == null) {
            return;
        }
        PhoneComms.transmitCountdownState(true, Time.now().value() - timerSec, null);
    }

    function syncPresetToPhone() as Void {
        PhoneComms.transmitCountdownState(false, null, _state.getPresetRemainingSeconds());
    }

    function syncPresetIfNotRunning() as Void {
        if (!_state.isCountdownRunning()) {
            syncPresetToPhone();
        }
    }

    function onCountdownHalted() as Void {
        syncGunCrossedFlag();
        syncPresetToPhone();
    }

    function onActivityEnded() as Void {
        syncGunCrossedFlag();
        showScreen(SpliceScreens.HEADING_HEEL);
        PhoneComms.transmitActivityEnded();
    }

    function onPhoneCountdownSync(gunUnix as Number) as Void {
        _state.applyGunUnix(gunUnix);
        PhoneComms.clearErrors();
        syncGunCrossedFlag();
        if (isCountdownScreen()) {
            WatchUi.requestUpdate();
        }
    }

    function onPhoneCountdownHalted(remaining as Number) as Void {
        _state.applyHaltedPreset(remaining);
        PhoneComms.clearErrors();
        syncGunCrossedFlag();
        if (isCountdownScreen()) {
            WatchUi.requestUpdate();
        }
    }

    function syncGunCrossedFlag() as Void {
        var timerSec = _state.getRaceTimerSeconds();
        _gunCrossed = timerSec != null && timerSec >= 0;
    }

    function noteCompassSample() as Void {
        _lastSampleMs = System.getTimer();
    }

    function disableCountdownControls() as Void {
        _state.disableControls();
        _countdownBackArmed = false;
        WatchUi.requestUpdate();
    }

    function armCountdownExit() as Void {
        _countdownBackArmed = true;
        WatchUi.requestUpdate();
    }

    function isCountdownExitArmed() as Boolean {
        return _countdownBackArmed;
    }

    function clearCountdownExitArm() as Void {
        _countdownBackArmed = false;
    }

    function shouldShowSequenceSettings() as Boolean {
        if (isCountdownScreen() && !_state.isCountdownRunning() && !_state.areControlsEnabled()) {
            return true;
        }
        return false;
    }

    function showSequenceMenu() as Void {
        var current = CountdownSequence.getId();
        var menu = new WatchUi.Menu2({ :title => "Countdown" });
        menu.addItem(new WatchUi.MenuItem(
            CountdownSequence.labelForId(CountdownSequence.SEQ_541),
            current == CountdownSequence.SEQ_541 ? "Selected" : null,
            CountdownSequence.SEQ_541,
            null
        ));
        menu.addItem(new WatchUi.MenuItem(
            CountdownSequence.labelForId(CountdownSequence.SEQ_321),
            current == CountdownSequence.SEQ_321 ? "Selected" : null,
            CountdownSequence.SEQ_321,
            null
        ));
        WatchUi.pushView(menu, new CountdownSequenceMenuDelegate(), WatchUi.SLIDE_UP);
    }

    function applyCountdownSequence(id as Number) as Void {
        CountdownSequence.setId(id);
        _loadedSequence = id == CountdownSequence.SEQ_321 ? CountdownSequence.SEQ_321 : CountdownSequence.SEQ_541;
        var minutes = CountdownSequence.defaultMinutes(_loadedSequence);
        if (!_state.isCountdownRunning() && !_state.isCountdownHalted()) {
            _state.setCountdownMinutes(minutes);
            Application.Properties.setValue("countdownMinutes", minutes);
        }
        WatchUi.requestUpdate();
    }

    function exitToMenu() as Void {
        if (_recorder.hasSession()) {
            showActivitySaveMenu();
            return;
        }
        WatchUi.popView(WatchUi.SLIDE_IMMEDIATE);
    }

    function showActivitySaveMenu() as Void {
        var menu = new WatchUi.Menu2({ :title => "Activity" });
        menu.addItem(new WatchUi.MenuItem("Save", null, :save, null));
        menu.addItem(new WatchUi.MenuItem("Resume", null, :resume, null));
        menu.addItem(new WatchUi.MenuItem("Discard", null, :discard, null));
        WatchUi.pushView(menu, new ActivitySaveMenuDelegate(), WatchUi.SLIDE_UP);
    }

    function saveStoppedActivity() as Void {
        _recorder.saveSession();
        _state.resetAfterActivityClosed();
        PhoneComms.transmitActivityEnded();
    }

    function resumeStoppedActivity() as Boolean {
        if (!_recorder.resumeSession()) {
            return false;
        }
        _state.resumeCountdown();
        onCountdownResumed();
        WatchUi.requestUpdate();
        return true;
    }

    function discardStoppedActivity() as Void {
        _recorder.discardSession();
        _state.resetAfterActivityClosed();
        PhoneComms.transmitActivityEnded();
    }

    function showScreen(index as Number) as Void {
        var count = screenCount();
        while (index < 0) {
            index += count;
        }
        index = index % count;
        _screenIndex = index;
        _countdownBackArmed = false;
        if (index != SpliceScreens.COUNTDOWN) {
            _countdownView = null;
        }
        if (index != SpliceScreens.SOG) {
            _sogView = null;
        }
        WatchUi.switchToView(getCachedView(index), getNavDelegate(), WatchUi.SLIDE_IMMEDIATE);
        syncScreenToPhone(index);
    }

    private function getNavDelegate() as SailingPerformanceDelegate {
        if (_navDelegate == null) {
            _navDelegate = new SailingPerformanceDelegate();
        }
        return _navDelegate;
    }

    private function ensureCachedViews() as Void {
        if (_cachedViews != null) {
            return;
        }
        _cachedViews = [
            new CountdownTimerView(_state),
            new HeadingHeelView(_state),
            new TrimTurnView(_state),
            new SogView(_state),
        ] as Array<SailingBaseView>;
    }

    function getCachedView(index as Number) as SailingBaseView {
        ensureCachedViews();
        if (index < 0 || index >= _cachedViews.size()) {
            return _cachedViews[SpliceScreens.COUNTDOWN];
        }
        return _cachedViews[index];
    }

    function screenCount() as Number {
        return maxScreenIndex() + 1;
    }

    private function maxScreenIndex() as Number {
        if (DisplayTier.allowsSog(_state.getDisplayTier())) {
            return SpliceScreens.SOG;
        }
        return SpliceScreens.TRIM_TURN;
    }

    function syncScreenToPhone(index as Number) as Void {
        if (index == SpliceScreens.COUNTDOWN) {
            PhoneComms.transmitScreenSync("countdown");
        } else if (index == SpliceScreens.HEADING_HEEL) {
            PhoneComms.transmitScreenSync("heading_heel");
        } else if (index == SpliceScreens.TRIM_TURN) {
            PhoneComms.transmitScreenSync("trim_turn");
        } else if (index == SpliceScreens.SOG) {
            PhoneComms.transmitScreenSync("sog");
        }
    }

    function showNextScreen() as Void {
        showScreen(_screenIndex + 1);
    }

    function showPreviousScreen() as Void {
        showScreen(_screenIndex - 1);
    }

    function makeView(index as Number) as SailingBaseView {
        return getCachedView(index);
    }

    function onPhoneDisplayConfig(tierName as String) as Void {
        var tier = DisplayTier.fromString(tierName);
        System.println("PhoneLink: display_config tier=" + DisplayTier.label(tier));
        applyDisplayTier(tier);
    }

    function applyDisplayTier(tier as Number) as Void {
        _state.setDisplayTier(tier);
        DisplayTier.saveToProperties(tier);
        if (DisplayTier.allowsSog(tier)) {
            enableGps();
        }
        if (_screenIndex == SpliceScreens.SOG && !DisplayTier.allowsSog(tier)) {
            showScreen(SpliceScreens.HEADING_HEEL);
        } else if (_view != null) {
            WatchUi.requestUpdate();
        }
    }

    function attachView(view as SailingBaseView) as Void {
        if (view == null || CompassProtocol.isSimulator()) {
            return;
        }
        _view = view;
        _uiReady = true;
        _state.setBleStatus(PhoneComms.getLinkStatus());
        ensureAppTick();
    }

    private function registerPhoneMessagesOnce() as Void {
        if (_phoneMessagesRegistered || CompassProtocol.isSimulator()) {
            return;
        }
        if (!(Toybox has :Communications)) {
            _state.setBleStatus(:no_comms);
            return;
        }
        if (!(Communications has :registerForPhoneAppMessages)) {
            _state.setBleStatus(:no_comms);
            return;
        }
        _phoneMessagesRegistered = true;
        Communications.registerForPhoneAppMessages(method(:onPhoneAppMessage));
        if (Communications has :registerForPhoneAppMessageErrors) {
            Communications.registerForPhoneAppMessageErrors(method(:onPhoneAppMessageError));
        }
        System.println("PhoneLink: registered for phone app messages");
    }

    function onPhoneAppMessage(message as Communications.PhoneAppMessage) as Void {
        PhoneComms.handlePhoneAppMessage(message);
    }

    function onPhoneAppMessageError(error as Communications.PhoneAppMessageError) as Void {
        PhoneComms.handlePhoneAppMessageError(error);
    }

    function onPhoneLinkStatus(status) as Void {
        _state.setBleStatus(status);
        if (_view != null) {
            _view.setBleStatus(status);
        }
    }

    function reattachCurrentScreenView() as Void {
        attachView(getCachedView(_screenIndex));
    }

    function onPhoneCompassSample(sample as Dictionary) as Void {
        noteCompassSample();
        _state.applySample(sample);
        if (_view != null) {
            _view.onCompassSample(sample);
        }
        _recorder.recordSample(_state);
        WatchUi.requestUpdate();
    }

    function onSettingsChanged() as Void {
        loadSettings();
    }

    function loadSettings() as Void {
        var seq = CountdownSequence.getId();
        var min = CountdownSequence.getMinMinutes();
        var minutes = Application.Properties.getValue("countdownMinutes");
        if (minutes == null) {
            minutes = CountdownSequence.getDefaultMinutes();
        }

        if (seq != _loadedSequence) {
            _loadedSequence = seq;
            if (!_state.isCountdownRunning() && !_state.isCountdownHalted()) {
                minutes = CountdownSequence.defaultMinutes(seq);
                Application.Properties.setValue("countdownMinutes", minutes);
            }
        }

        if (minutes < min) {
            minutes = min;
            Application.Properties.setValue("countdownMinutes", minutes);
        }
        if (!_state.isCountdownRunning() && !_state.isCountdownHalted()) {
            _state.setCountdownMinutes(minutes);
        }
    }

    private function ensureAppTick() as Void {
        if (_appTickTimer == null) {
            _appTickTimer = new Timer.Timer();
        }
        _appTickTimer.start(method(:onAppTick), APP_TICK_MS, true);
    }

    private function stopAppTick() as Void {
        if (_appTickTimer != null) {
            _appTickTimer.stop();
        }
    }

    function onAppTick() as Void {
        tickPhoneLink();
        tickCountdown();
        tickGps();
        ActivityFeedback.tick();
        PhoneComms.pollAckTimeout();
    }

    private function tickGps() as Void {
        var sogKnots = 0.0;
        var hasFix = false;

        if (_gps.isEnabled()) {
            sogKnots = _gps.getSogKnots();
            hasFix = _gps.hasFix();
        }

        if (!hasFix && (Toybox has :Activity) && _recorder.isRecording()) {
            var actInfo = Activity.getActivityInfo();
            if (actInfo != null && actInfo.currentSpeed != null) {
                var speed = actInfo.currentSpeed;
                if (speed >= 0) {
                    sogKnots = speed * MPS_TO_KNOTS;
                    hasFix = true;
                }
            }
        }

        if (!hasFix && _gps.isEnabled() && (Toybox has :Position)) {
            var posInfo = Position.getInfo();
            if (posInfo != null && posInfo.speed != null && posInfo.speed >= 0) {
                sogKnots = posInfo.speed * MPS_TO_KNOTS;
                hasFix = true;
            }
        }

        _state.applyGpsSample(sogKnots, hasFix);

        if (DisplayTier.allowsSog(_state.getDisplayTier())
            && _gps.isEnabled()
            && !CompassProtocol.isSimulator()) {
            PhoneComms.transmitGpsSample(
                sogKnots,
                hasFix,
                _gps.getCogDeg(),
                _gps.hasCog()
            );
        }

        if (_screenIndex == SpliceScreens.SOG && _view != null) {
            WatchUi.requestUpdate();
        }
    }

    private function tickCountdown() as Void {
        if (GunCrossingSequence.isActive()) {
            var timerSec = _state.getRaceTimerSeconds();
            WatchUi.requestUpdate();
            if (GunCrossingSequence.isComplete(timerSec)) {
                finishGunSequence();
            }
            return;
        }
        if (!_state.isCountdownRunning()) {
            return;
        }
        var timerSec = _state.getRaceTimerSeconds();
        if (timerSec != null && timerSec < 0) {
            var rem = -timerSec;
            CountdownAlerts.onPreGunSecond(rem);
            if (rem <= PRE_GUN_FAST_REM) {
                startPreGunFastTimer();
            }
        }
        checkGunCrossing();
        WatchUi.requestUpdate();
    }

    function onPreGunFastTick() as Void {
        if (!_state.isCountdownRunning() || _gunCrossed) {
            stopPreGunFastTimer();
            return;
        }
        var timerSec = _state.getRaceTimerSeconds();
        if (timerSec != null && timerSec < 0) {
            CountdownAlerts.onPreGunSecond(-timerSec);
            if (-timerSec > PRE_GUN_FAST_REM) {
                stopPreGunFastTimer();
            }
        }
        checkGunCrossing();
        WatchUi.requestUpdate();
    }

    private function startPreGunFastTimer() as Void {
        if (_preGunFastActive) {
            return;
        }
        if (_preGunFastTimer == null) {
            _preGunFastTimer = new Timer.Timer();
        }
        _preGunFastActive = true;
        _preGunFastTimer.start(method(:onPreGunFastTick), PRE_GUN_FAST_MS, true);
    }

    private function stopPreGunFastTimer() as Void {
        if (!_preGunFastActive) {
            return;
        }
        _preGunFastActive = false;
        if (_preGunFastTimer != null) {
            _preGunFastTimer.stop();
        }
    }

    private function crossGun() as Void {
        _gunCrossed = true;
        stopPreGunFastTimer();
        _state.fireStartGun();
        CountdownAlerts.onGun();
        PhoneComms.transmitStartTimerNow();
        startGunSeqTimer();
    }

    private function checkGunCrossing() as Void {
        if (_gunCrossed) {
            return;
        }
        var timerSec = _state.getRaceTimerSeconds();
        if (timerSec == null || timerSec < 0) {
            return;
        }
        crossGun();
    }

    private function startGunSeqTimer() as Void {
        if (_gunSeqTimer == null) {
            _gunSeqTimer = new Timer.Timer();
        }
        _gunSeqTimer.start(method(:onGunSeqTick), 100, true);
    }

    private function stopGunSeqTimer() as Void {
        if (_gunSeqTimer != null) {
            _gunSeqTimer.stop();
        }
    }

    function onGunSeqTick() as Void {
        if (!GunCrossingSequence.isActive()) {
            stopGunSeqTimer();
            return;
        }
        var timerSec = _state.getRaceTimerSeconds();
        WatchUi.requestUpdate();
        if (GunCrossingSequence.isComplete(timerSec)) {
            finishGunSequence();
        }
    }

    private function finishGunSequence() as Void {
        stopGunSeqTimer();
        if (GunCrossingSequence.isActive()) {
            GunCrossingSequence.reset();
        }
        showScreen(SpliceScreens.HEADING_HEEL);
    }

    private function tickPhoneLink() as Void {
        PhoneComms.pollLinkStale();

        var now = System.getTimer();
        if (_state.hasSample() && (now - _lastSampleMs) < PHONE_SAMPLE_STALE_MS) {
            return;
        }

        var status = _state.getBleStatus();
        if (status == :waiting) {
            return;
        }

        if (now - _lastPhoneLinkRetryMs < PHONE_LINK_RETRY_MS) {
            return;
        }

        _lastPhoneLinkRetryMs = now;
        if (status == :stale || status == :lost) {
            System.println("PhoneLink: link stale/lost — waiting for phone");
            _state.setBleStatus(:waiting);
            PhoneComms.setLinkStatus(:waiting);
        }
    }
}
