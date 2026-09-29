package org.hdo.app;

import android.os.Build;
import android.view.View;
import android.view.WindowInsets;

/**
 * Android 15 draws every app edge-to-edge (behind the status bar, navigation bar and keyboard).
 * These helpers pad our views so nothing slides under the phone's bars.
 */
final class Edge {
    private Edge() {}

    /** Status bar, navigation bar, camera cut-out and (when open) the keyboard, as {left, top, right, bottom}. */
    @SuppressWarnings("deprecation")
    static int[] bars(WindowInsets in) {
        if (Build.VERSION.SDK_INT >= 30) {
            android.graphics.Insets b = in.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            android.graphics.Insets ime = in.getInsets(WindowInsets.Type.ime());
            return new int[]{b.left, b.top, b.right, Math.max(b.bottom, ime.bottom)};
        }
        return new int[]{in.getSystemWindowInsetLeft(), in.getSystemWindowInsetTop(),
                in.getSystemWindowInsetRight(), in.getSystemWindowInsetBottom()};
    }

    /** Draw behind the bars on every Android 11+ phone (Android 15 forces it anyway), so padding is the same everywhere. */
    static void edgeToEdge(android.view.Window w) {
        if (Build.VERSION.SDK_INT < 30) return;
        w.setDecorFitsSystemWindows(false);
        // our own background shows behind the bars (Android 15 ignores bar colors anyway)
        w.setStatusBarColor(android.graphics.Color.TRANSPARENT);
        w.setNavigationBarColor(android.graphics.Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= 29) w.setNavigationBarContrastEnforced(false);
    }

    /** Light (dark icons) or dark (white icons) status/navigation bar icons. */
    static void lightBars(android.view.Window w, boolean light) {
        if (Build.VERSION.SDK_INT < 30 || w.getInsetsController() == null) return;
        int mask = android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                | android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
        w.getInsetsController().setSystemBarsAppearance(light ? mask : 0, mask);
    }

    /** Keeps {@code root} padded clear of the system bars (and keyboard) whenever they change. */
    static void pad(View root, View... alsoPad) {
        if (Build.VERSION.SDK_INT < 30) return; // older phones keep the classic layout (never under the bars)
        root.setOnApplyWindowInsetsListener((v, in) -> {
            int[] b = bars(in);
            if (alsoPad.length == 0) v.setPadding(b[0], b[1], b[2], b[3]);
            for (View x : alsoPad) x.setPadding(b[0], b[1], b[2], b[3]);
            return in;
        });
        root.requestApplyInsets();
    }
}
