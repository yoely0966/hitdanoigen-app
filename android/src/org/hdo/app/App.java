package org.hdo.app;

import android.app.Activity;
import android.app.Application;
import android.os.Bundle;

/**
 * Knows when the whole app goes to the background, so the fingerprint lock only asks again after
 * the user really left the app - never when moving between the app's own screens.
 */
public class App extends Application {
    /** How many of our screens are currently started (visible or about to be). */
    static int started;

    @Override
    public void onCreate() {
        super.onCreate();
        registerActivityLifecycleCallbacks(new ActivityLifecycleCallbacks() {
            @Override public void onActivityStarted(Activity a) {
                if (started++ == 0) AppLock.onForeground();
            }

            @Override public void onActivityStopped(Activity a) {
                if (--started <= 0) { started = 0; AppLock.onBackground(); }
            }

            @Override public void onActivityCreated(Activity a, Bundle b) {}
            @Override public void onActivityResumed(Activity a) {}
            @Override public void onActivityPaused(Activity a) {}
            @Override public void onActivitySaveInstanceState(Activity a, Bundle b) {}
            @Override public void onActivityDestroyed(Activity a) {}
        });
    }
}
