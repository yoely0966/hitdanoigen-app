package org.hdo.app;

import android.annotation.SuppressLint;
import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * Signs in exactly like the website does: fills the forum's /login form in a hidden WebView,
 * lets the site's own single-sign-on hand over to app.hitdanoigen.com, then reads the API token
 * the web app stores in localStorage. The forum cookies stay in the shared CookieManager, so the
 * in-app browser and the chart pages are logged in too. No server of our own is involved.
 */
public final class Auth {
    static final String SITE = "https://hitdanoigen.com";
    static final String APP = "https://app.hitdanoigen.com";
    private static final long TIMEOUT_MS = 45_000;

    interface Callback { void done(boolean ok, String error); }

    private static final Object LOCK = new Object();
    private static final Object REFRESH_LOCK = new Object();
    private static boolean running;

    private Auth() {}

    /** Full login with a username/password typed by the user. Must be called on the main thread. */
    static void login(Context ctx, String user, String pass, boolean remember, Callback cb) {
        Context app = ctx.getApplicationContext();
        run(app, SITE + "/login", user, pass, (ok, err) -> {
            if (ok) {
                Store.put(app, "username", user);
                if (remember) Store.saveLogin(app, user, pass);
                else Store.put(app, "login", null);
            }
            cb.done(ok, err);
        });
    }

    /**
     * Gets a fresh API token: first through the still-valid forum session, then (if the user chose
     * "stay logged in") with the saved login. Blocks; call from a background thread only.
     */
    static boolean refreshBlocking(Context ctx) {
        Context app = ctx.getApplicationContext();
        String before = Store.token(app);
        synchronized (REFRESH_LOCK) {
            // another thread may have refreshed while we waited
            String now = Store.token(app);
            if (now != null && !now.equals(before) && Store.tokenFresh(now, 60)) return true;
            String[] login = Store.loadLogin(app);
            CountDownLatch latch = new CountDownLatch(1);
            boolean[] result = {false};
            new Handler(Looper.getMainLooper()).post(() -> run(app, SITE + "/login",
                    login != null ? login[0] : null, login != null ? login[1] : null,
                    (ok, err) -> { result[0] = ok; latch.countDown(); }));
            try {
                latch.await(TIMEOUT_MS + 5_000, TimeUnit.MILLISECONDS);
            } catch (InterruptedException ignored) {}
            return result[0];
        }
    }

    static void logout(Context ctx) {
        Context app = ctx.getApplicationContext();
        Store.clearAll(app);
        CookieManager.getInstance().removeAllCookies(null);
        CookieManager.getInstance().flush();
        WebStorage.getInstance().deleteAllData();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private static void run(Context app, String startUrl, String user, String pass, Callback cb) {
        synchronized (LOCK) {
            if (running) { cb.done(false, "busy"); return; }
            running = true;
        }
        CookieManager.getInstance().setAcceptCookie(true);
        // forget the old token so whatever shows up in localStorage afterwards is a fresh one
        WebStorage.getInstance().deleteOrigin(APP);

        Handler h = new Handler(Looper.getMainLooper());
        WebView wv = new WebView(app);
        WebSettings s = wv.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setBlockNetworkImage(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(wv, true);

        final boolean[] submitted = {false};
        final boolean[] finished = {false};
        final boolean[] polling = {false};

        Runnable[] finish = new Runnable[1];
        final String[] outcome = {null}; // null = ok, otherwise error text
        finish[0] = () -> {
            if (finished[0]) return;
            finished[0] = true;
            h.removeCallbacksAndMessages(null);
            CookieManager.getInstance().flush();
            try { wv.stopLoading(); wv.destroy(); } catch (Exception ignored) {}
            synchronized (LOCK) { running = false; }
            cb.done(outcome[0] == null, outcome[0]);
        };

        Runnable poll = new Runnable() {
            @Override public void run() {
                if (finished[0]) return;
                wv.evaluateJavascript("localStorage.getItem('token')", v -> {
                    String t = unquote(v);
                    if (t != null && t.split("\\.").length == 3 && Store.tokenFresh(t, 60)) {
                        Store.setToken(app, t);
                        outcome[0] = null;
                        finish[0].run();
                    } else if (!finished[0]) {
                        h.postDelayed(this, 600);
                    }
                });
            }
        };

        wv.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                return false;
            }

            @Override public void onPageFinished(WebView view, String url) {
                if (finished[0]) return;
                Uri u = Uri.parse(url);
                String host = u.getHost() == null ? "" : u.getHost();
                String path = u.getPath() == null ? "" : u.getPath();
                if (host.equals("app.hitdanoigen.com")) {
                    if (path.startsWith("/signin") || path.startsWith("/login")) {
                        // the web app wants a login -> use the forum login page, which does SSO
                        if (submitted[0]) { outcome[0] = "bad_login"; finish[0].run(); }
                        else view.loadUrl(SITE + "/login");
                        return;
                    }
                    if (!polling[0]) { polling[0] = true; h.post(poll); }
                    return;
                }
                if (!host.endsWith("hitdanoigen.com")) return;
                if (path.startsWith("/login") || path.startsWith("/signin")) {
                    if (submitted[0]) {
                        // came back to the login page -> read the site's error message
                        view.evaluateJavascript(ERROR_JS, v -> {
                            String msg = unquote(v);
                            outcome[0] = msg == null || msg.isEmpty() ? "bad_login" : msg;
                            finish[0].run();
                        });
                        return;
                    }
                    if (user == null) { outcome[0] = "need_login"; finish[0].run(); return; }
                    submitted[0] = true;
                    view.evaluateJavascript("(" + FILL_JS + ")(" + JSONObject.quote(user) + "," + JSONObject.quote(pass) + ")", null);
                } else if (!submitted[0]) {
                    // already logged in to the forum -> continue to the app, which does SSO
                    view.loadUrl(APP + "/");
                }
            }
        });
        h.postDelayed(() -> { if (outcome[0] == null) outcome[0] = "timeout"; finish[0].run(); }, TIMEOUT_MS);
        wv.loadUrl(startUrl);
    }

    private static final String FILL_JS =
            "function(u,p){var pw=document.querySelector('input[name=passwd],input[type=password]');"
            + "var f=pw&&pw.form;if(!f){location.href='" + APP + "/';return 'nf';}"
            + "var un=f.querySelector('input[name=username],input[type=text],input[type=email]');"
            + "un.value=u;pw.value=p;var r=f.querySelector('input[name=remember]');if(r)r.checked=true;"
            + "var b=f.querySelector('[type=submit]');if(b)b.click();else HTMLFormElement.prototype.submit.call(f);return 'ok';}";

    private static final String ERROR_JS =
            "(function(){var e=document.querySelector('#system-message .message, #system-message, .alert-error, .alert, .error');"
            + "return e?e.innerText.trim().slice(0,200):'';})()";

    static String unquote(String v) {
        if (v == null || v.equals("null") || v.length() < 2) return null;
        try {
            return new org.json.JSONTokener(v).nextValue().toString();
        } catch (Exception e) {
            return null;
        }
    }
}
