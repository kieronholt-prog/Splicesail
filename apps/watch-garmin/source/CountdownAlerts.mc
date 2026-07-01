import Toybox.Attention;
import Toybox.Lang;
import Toybox.System;
import Toybox.WatchUi;

//! Sequence-based pre-gun alerts and GO at 00:00.
module CountdownAlerts {

    var mLastAlertSec = -1;
    var mGunPlayed = false;

    function reset() as Void {
        mLastAlertSec = -1;
        mGunPlayed = false;
        GunCrossingSequence.reset();
    }

    function onPreGunSecond(remainingSec as Number) as Void {
        if (remainingSec == mLastAlertSec) {
            return;
        }

        if (isSequenceMinuteMark(remainingSec)) {
            mLastAlertSec = remainingSec;
            playIntervalAlert();
            return;
        }
        if (remainingSec == 30) {
            mLastAlertSec = remainingSec;
            playHiAlert();
            return;
        }
        if (remainingSec <= 10 && remainingSec >= 1) {
            mLastAlertSec = remainingSec;
            playLoudBeep();
        }
    }

    function onGun() as Void {
        if (mGunPlayed) {
            return;
        }
        mGunPlayed = true;
        GunCrossingSequence.start();
        playGunAlert();
        WatchUi.requestUpdate();
    }

    function isSequenceMinuteMark(remainingSec as Number) as Boolean {
        var marks = CountdownSequence.getMinuteMarks();
        for (var i = 0; i < marks.size(); i += 1) {
            if (remainingSec == marks[i] * 60) {
                return true;
            }
        }
        return false;
    }

    function playIntervalAlert() as Void {
        if (Attention has :playTone) {
            Attention.playTone(Attention.TONE_INTERVAL_ALERT);
        }
        vibrate([new Attention.VibeProfile(55, 120)]);
    }

    function playHiAlert() as Void {
        if (Attention has :playTone) {
            Attention.playTone(Attention.TONE_ALERT_HI);
        }
        vibrate([
            new Attention.VibeProfile(70, 100),
            new Attention.VibeProfile(40, 80),
        ]);
    }

    function playLoudBeep() as Void {
        if (Attention has :playTone) {
            Attention.playTone(Attention.TONE_LOUD_BEEP);
        }
        vibrate([new Attention.VibeProfile(100, 90)]);
    }

    function playGunAlert() as Void {
        if (Attention has :playTone) {
            Attention.playTone(Attention.TONE_CANARY);
        }
        vibrate([
            new Attention.VibeProfile(100, 200),
            new Attention.VibeProfile(60, 120),
            new Attention.VibeProfile(100, 200),
        ]);
    }

    function vibrate(profiles as Array<Attention.VibeProfile>) as Void {
        if (Attention has :vibrate) {
            Attention.vibrate(profiles);
        }
    }
}
