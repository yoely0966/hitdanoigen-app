package org.hdo.app;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.hardware.biometrics.BiometricManager;
import android.hardware.biometrics.BiometricPrompt;
import android.os.Build;
import android.os.CancellationSignal;

/** Optional fingerprint / face (or phone PIN) lock in front of the app. */
public final class AppLock {
    /** Re-lock after the app was in the background this long. */
    static final long GRACE_MS = 30_000;

    interface Result { void done(boolean ok); }

    private AppLock() {}

    static boolean enabled(Context c) { return Store.prefs(c).getBoolean("lock", false); }

    static void setEnabled(Context c, boolean on) { Store.prefs(c).edit().putBoolean("lock", on).apply(); }

    /** Unlocked in this process, and when any of our screens was last visible. */
    static boolean unlocked;
    static long lastSeen;

    /** True when a screen must ask again (lock on, and never unlocked or away longer than the grace time). */
    static boolean needed(Context c) {
        return enabled(c) && (!unlocked || System.currentTimeMillis() - lastSeen > GRACE_MS);
    }

    /** True when the phone has a fingerprint/face enrolled (or a screen lock to fall back to). */
    @SuppressWarnings("deprecation")
    static boolean available(Context c) {
        if (Build.VERSION.SDK_INT < 28) return false;
        KeyguardManager km = c.getSystemService(KeyguardManager.class);
        boolean secure = km != null && km.isDeviceSecure();
        if (Build.VERSION.SDK_INT >= 30) {
            BiometricManager bm = c.getSystemService(BiometricManager.class);
            return bm != null && bm.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK
                    | BiometricManager.Authenticators.DEVICE_CREDENTIAL) == BiometricManager.BIOMETRIC_SUCCESS;
        }
        if (Build.VERSION.SDK_INT == 29) {
            BiometricManager bm = c.getSystemService(BiometricManager.class);
            return secure || (bm != null && bm.canAuthenticate() == BiometricManager.BIOMETRIC_SUCCESS);
        }
        android.hardware.fingerprint.FingerprintManager fm = c.getSystemService(android.hardware.fingerprint.FingerprintManager.class);
        return fm != null && fm.isHardwareDetected() && fm.hasEnrolledFingerprints();
    }

    static void prompt(Activity a, String subtitle, Result r) {
        if (Build.VERSION.SDK_INT < 28) { r.done(true); return; }
        BiometricPrompt.Builder b = new BiometricPrompt.Builder(a)
                .setTitle("היט דיינע אויגן")
                .setSubtitle(subtitle);
        if (Build.VERSION.SDK_INT >= 30) {
            b.setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_WEAK
                    | BiometricManager.Authenticators.DEVICE_CREDENTIAL);
        } else if (Build.VERSION.SDK_INT == 29) {
            b.setDeviceCredentialAllowed(true);
        } else {
            b.setNegativeButton("קענסל", a.getMainExecutor(), (d, w) -> r.done(false));
        }
        final boolean[] fired = {false};
        b.build().authenticate(new CancellationSignal(), a.getMainExecutor(), new BiometricPrompt.AuthenticationCallback() {
            @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult res) {
                if (!fired[0]) { fired[0] = true; unlocked = true; lastSeen = System.currentTimeMillis(); r.done(true); }
            }

            @Override public void onAuthenticationError(int code, CharSequence msg) {
                if (!fired[0]) { fired[0] = true; r.done(false); }
            }
        });
    }
}
