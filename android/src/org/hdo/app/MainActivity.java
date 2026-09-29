package org.hdo.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Hosts the app's own screens (assets/ui) in a WebView. The page never loads remote code:
 * data comes through the {@code Native} bridge, which calls the website from the phone.
 */
public class MainActivity extends Activity {
    private static final String UI = "file:///android_asset/ui/index.html";
    /** remote WebView debugging over adb - keep false in releases */
    static final boolean DEBUG = false;
    private final ExecutorService pool = Executors.newFixedThreadPool(4);
    private WebView web;
    private View cover;
    private boolean dark;
    private boolean prompting;
    /** false after the user cancelled the prompt: wait for the unlock button instead of re-asking */
    private boolean autoPrompt = true;
    private String pendingAction;
    /** hidden copy of the website; its messenger (Intercom) tells us about new messages from the staff */
    private WebView staffWeb;
    static final String OPEN_MESSENGER = "(function s(n){if(window.Intercom){Intercom('show')}else if(n<40){setTimeout(function(){s(n+1)},500)}})(0)";

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        boolean dark = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        Window w = getWindow();
        int bg = Color.parseColor(dark ? "#13111C" : "#F6F5FB");
        w.setStatusBarColor(bg);
        w.setNavigationBarColor(bg);
        Edge.edgeToEdge(w);
        this.dark = dark;

        if (DEBUG) WebView.setWebContentsDebuggingEnabled(true);
        web = new WebView(this);
        web.setBackgroundColor(bg);
        android.widget.FrameLayout root = new android.widget.FrameLayout(this);
        root.setBackgroundColor(bg);
        // the page sits inside a padded frame so it never slides under the status / navigation bar
        android.widget.FrameLayout page = new android.widget.FrameLayout(this);
        page.addView(web);
        root.addView(page);
        cover = buildCover(dark);
        root.addView(cover);
        setContentView(root);
        showCover(AppLock.needed(this));
        Edge.pad(root, page, cover);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setTextZoom(100);
        web.addJavascriptInterface(new Bridge(), "Native");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                String url = r.getUrl().toString();
                if (url.startsWith("file:///android_asset/")) return false;
                openUrl(url, null);
                return true;
            }
        });
        pendingAction = getIntent().getStringExtra("action");
        web.loadUrl(UI);
        Reminders.schedule(this);
        startStaffWatch();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String a = intent.getStringExtra("action");
        if (a != null) js("window.onNativeAction&&window.onNativeAction(" + JSONObject.quote(a) + ")");
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (AppLock.needed(this)) lock(false);
        else if (cover != null && cover.getVisibility() == View.VISIBLE && !prompting) showCover(false);
        js("window.onResumeApp&&window.onResumeApp()");
    }

    @Override
    protected void onPause() {
        super.onPause();
    }

    @Override
    protected void onStop() {
        super.onStop();
        autoPrompt = true;
        // hide the content in the recent-apps preview while locked-able
        if (App.started == 0 && AppLock.enabled(this) && cover != null) showCover(true);
    }

    /** Shows the cover and asks for fingerprint / face / PIN. */
    private void showCover(boolean on) {
        cover.setVisibility(on ? View.VISIBLE : View.GONE);
        Edge.lightBars(getWindow(), !on && !dark);
    }

    private void lock(boolean fromUser) {
        showCover(true);
        if (prompting) return;
        if (!AppLock.needed(this)) { showCover(false); return; }
        if (!AppLock.available(this)) {
            // the phone's fingerprint / PIN was removed - never lock the user out of the app
            AppLock.setEnabled(this, false);
            showCover(false);
            android.widget.Toast.makeText(this, "דער לאק איז אפ – דער פאון האט נישט קיין פינגערפרינט אדער PIN", android.widget.Toast.LENGTH_LONG).show();
            return;
        }
        if (!fromUser && !autoPrompt) return;
        prompting = true;
        AppLock.prompt(this, "לאג אריין מיט פינגערפרינט אדער פעיס", ok -> {
            prompting = false;
            if (ok) showCover(false);
            else autoPrompt = false;
        });
    }

    /** Full-screen lock page: purple gradient, logo, name and a big "unlock" button. */
    private View buildCover(boolean dark) {
        float dp = getResources().getDisplayMetrics().density;
        android.widget.LinearLayout c = new android.widget.LinearLayout(this);
        c.setOrientation(android.widget.LinearLayout.VERTICAL);
        c.setGravity(android.view.Gravity.CENTER);
        c.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        c.setBackground(new android.graphics.drawable.GradientDrawable(
                android.graphics.drawable.GradientDrawable.Orientation.TL_BR,
                dark ? new int[]{0xFF4C1D95, 0xFF312E81} : new int[]{0xFF8B5CF6, 0xFF4F46E5}));
        c.setClickable(true);
        c.setFocusable(true);

        android.widget.LinearLayout box = new android.widget.LinearLayout(this);
        box.setOrientation(android.widget.LinearLayout.VERTICAL);
        box.setGravity(android.view.Gravity.CENTER_HORIZONTAL);
        box.setPadding((int) (32 * dp), 0, (int) (32 * dp), 0);

        // logo on a soft white circle
        android.widget.FrameLayout ring = new android.widget.FrameLayout(this);
        android.graphics.drawable.GradientDrawable ringBg = new android.graphics.drawable.GradientDrawable();
        ringBg.setShape(android.graphics.drawable.GradientDrawable.OVAL);
        ringBg.setColor(0x26FFFFFF);
        ring.setBackground(ringBg);
        android.widget.ImageView logo = new android.widget.ImageView(this);
        logo.setImageResource(R.mipmap.ic_launcher);
        android.widget.FrameLayout.LayoutParams lp = new android.widget.FrameLayout.LayoutParams((int) (92 * dp), (int) (92 * dp), android.view.Gravity.CENTER);
        ring.addView(logo, lp);
        box.addView(ring, new android.widget.LinearLayout.LayoutParams((int) (136 * dp), (int) (136 * dp)));

        android.widget.TextView t = coverText("היט דיינע אויגן", 26, true, 0xFFFFFFFF);
        t.setPadding(0, (int) (22 * dp), 0, (int) (6 * dp));
        box.addView(t, new android.widget.LinearLayout.LayoutParams(-1, -2));
        android.widget.TextView sub = coverText("🔒  די עפפ איז געלאקט", 15, false, 0xD9FFFFFF);
        sub.setPadding(0, 0, 0, (int) (36 * dp));
        box.addView(sub, new android.widget.LinearLayout.LayoutParams(-1, -2));

        android.widget.Button b = new android.widget.Button(this);
        b.setText("לאג אריין");
        b.setAllCaps(false);
        b.setTextSize(17);
        b.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        b.setTextColor(0xFF5B21B6);
        android.graphics.drawable.GradientDrawable g = new android.graphics.drawable.GradientDrawable();
        g.setColor(0xFFFFFFFF);
        g.setCornerRadius(28 * dp);
        b.setBackground(g);
        b.setStateListAnimator(null);
        b.setOnClickListener(v -> lock(true));
        box.addView(b, new android.widget.LinearLayout.LayoutParams(-1, (int) (56 * dp)));

        android.widget.TextView hint = coverText("פינגערפרינט, פעיס אדער PIN", 13, false, 0xB3FFFFFF);
        hint.setPadding(0, (int) (14 * dp), 0, 0);
        box.addView(hint, new android.widget.LinearLayout.LayoutParams(-1, -2));

        c.addView(box, new android.widget.LinearLayout.LayoutParams(-1, -2));
        return c;
    }

    private android.widget.TextView coverText(String s, int sp, boolean bold, int color) {
        android.widget.TextView t = new android.widget.TextView(this);
        t.setText(s);
        t.setTextSize(sp);
        t.setTextColor(color);
        t.setGravity(android.view.Gravity.CENTER);
        t.setTextAlignment(View.TEXT_ALIGNMENT_CENTER);
        if (bold) t.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        return t;
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.onBack?window.onBack():false", v -> {
            if (!"true".equals(v)) super.onBackPressed();
        });
    }

    /**
     * Loads the website invisibly (already logged in through the shared storage) and asks its
     * messenger for the unread count; the page shows a popup + badge like the site does.
     */
    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    void startStaffWatch() {
        if (staffWeb != null || !Store.loggedIn(this)) return;
        staffWeb = new WebView(this);
        staffWeb.getSettings().setJavaScriptEnabled(true);
        staffWeb.getSettings().setDomStorageEnabled(true);
        staffWeb.getSettings().setBlockNetworkImage(true);
        staffWeb.addJavascriptInterface(new Object() {
            @JavascriptInterface public void unread(int n) {
                js("window.onStaffUnread&&window.onStaffUnread(" + n + ")");
            }
        }, "StaffBridge");
        staffWeb.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView v, String url) {
                v.evaluateJavascript("(function w(n){if(window.Intercom){Intercom('onUnreadCountChange',function(c){StaffBridge.unread(c)})}"
                        + "else if(n<60){setTimeout(function(){w(n+1)},1000)}})(0)", null);
            }
        });
        staffWeb.loadUrl(Auth.APP + "/");
    }

    @Override
    protected void onDestroy() {
        if (staffWeb != null) { staffWeb.destroy(); staffWeb = null; }
        pool.shutdownNow();
        web.destroy();
        super.onDestroy();
    }

    private void js(String code) {
        runOnUiThread(() -> { if (web != null) web.evaluateJavascript(code, null); });
    }

    private void reply(String cb, int id, int status, String body) {
        js("window." + cb + "(" + id + "," + status + "," + JSONObject.quote(body == null ? "" : body) + ")");
    }

    void openUrl(String url, String title) {
        Uri u = Uri.parse(url);
        String host = u.getHost() == null ? "" : u.getHost();
        if (("http".equals(u.getScheme()) || "https".equals(u.getScheme())) && WebActivity.isSite(host)) {
            startActivity(new Intent(this, WebActivity.class).putExtra("url", url).putExtra("title", title));
        } else {
            try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) {}
        }
    }

    /** Everything the page may ask the phone to do. */
    private final class Bridge {
        @JavascriptInterface public boolean isLoggedIn() { return Store.loggedIn(MainActivity.this); }

        @JavascriptInterface public String username() {
            String n = Store.get(MainActivity.this, "displayName");
            return n != null ? n : Store.savedUsername(MainActivity.this);
        }

        @JavascriptInterface public void login(String user, String pass, boolean remember) {
            runOnUiThread(() -> Auth.login(MainActivity.this, user.trim(), pass, remember, (ok, err) -> {
                if (ok) {
                    Reminders.schedule(MainActivity.this);
                    ChartWidget.refreshAsync(MainActivity.this);
                    startStaffWatch();
                }
                js("window.onLogin(" + ok + "," + JSONObject.quote(err == null ? "" : err) + ")");
            }));
        }

        @JavascriptInterface public void logout() {
            runOnUiThread(() -> {
                Auth.logout(MainActivity.this);
                Reminders.schedule(MainActivity.this);
                ChartWidget.render(MainActivity.this);
            });
        }

        /** Async HTTP; answers with window.onHttp(id, status, body). */
        @JavascriptInterface public void http(int id, String method, String url, String body) {
            if (!url.startsWith(Api.API) && !url.startsWith(Api.CHAT) && !url.startsWith(Auth.SITE + "/") && !url.startsWith(Auth.APP)) {
                reply("onHttp", id, 0, "{\"error\":\"blocked\"}");
                return;
            }
            pool.execute(() -> {
                Api.Resp r = Api.call(MainActivity.this, method, url, body);
                reply("onHttp", id, r.status, r.body);
            });
        }

        /** Form post to the forum (replies, new topics); answers with window.onHttp. */
        @JavascriptInterface public void httpForm(int id, String url, String body) {
            if (!url.startsWith(Auth.SITE + "/")) { reply("onHttp", id, 0, "{\"error\":\"blocked\"}"); return; }
            pool.execute(() -> {
                Api.Resp r = Api.call(MainActivity.this, "POST", url, body, true, "application/x-www-form-urlencoded; charset=UTF-8");
                reply("onHttp", id, r.status, r.body);
            });
        }

        @JavascriptInterface public void checkedIn(boolean setback) {
            if (setback) Store.prefs(MainActivity.this).edit().putLong("streakStartAt", 0).apply();
            ChartWidget.refreshAsync(MainActivity.this);
        }

        @JavascriptInterface public String getSettings() { return Store.settings(MainActivity.this).toString(); }

        @JavascriptInterface public void setSettings(String json) {
            try {
                JSONObject o = new JSONObject(json);
                Store.put(MainActivity.this, "settings", o.toString());
                if (o.optBoolean("remind")) askNotifPermission();
                Reminders.schedule(MainActivity.this);
            } catch (Exception ignored) {}
        }

        @JavascriptInterface public boolean lockAvailable() { return AppLock.available(MainActivity.this); }

        @JavascriptInterface public boolean lockEnabled() { return AppLock.enabled(MainActivity.this); }

        /** Turning the lock on or off needs a successful scan first; answers window.onLockSet(on). */
        @JavascriptInterface public void setLock(boolean on) {
            runOnUiThread(() -> {
                prompting = true;
                AppLock.prompt(MainActivity.this, on ? "קאנפירם צו צינדן אן דעם לאק" : "קאנפירם צו אויסלעשן דעם לאק", ok -> {
                    prompting = false;
                    if (ok) AppLock.setEnabled(MainActivity.this, on);
                    js("window.onLockSet(" + AppLock.enabled(MainActivity.this) + "," + ok + ")");
                });
            });
        }

        /** Opens the site's sign-up inside the app; WebActivity picks up the new login at the end. */
        @JavascriptInterface public void signup() {
            runOnUiThread(() -> startActivity(new Intent(MainActivity.this, WebActivity.class)
                    .putExtra("url", Auth.APP + "/signup").putExtra("title", "נייע אקאונט").putExtra("capture", true)));
        }

        /** The staff messages (the site's messenger), opened full screen inside the app. */
        @JavascriptInterface public void openStaff() {
            runOnUiThread(() -> startActivity(new Intent(MainActivity.this, WebActivity.class)
                    .putExtra("url", Auth.APP + "/").putExtra("title", "מעסעדזשעס פון שטאב").putExtra("js", OPEN_MESSENGER)));
        }

        @JavascriptInterface public void openHandbook() {
            runOnUiThread(() -> startActivity(new Intent(MainActivity.this, ReaderActivity.class)));
        }

        /** {downloaded, page (1-based), pages, marks} for the "continue reading" card. */
        @JavascriptInterface public String handbookInfo() {
            android.content.SharedPreferences sp = Store.prefs(MainActivity.this);
            try {
                return new JSONObject()
                        .put("downloaded", ReaderActivity.file(MainActivity.this).exists())
                        .put("page", sp.getInt("hb_page", 0) + 1)
                        .put("pages", sp.getInt("hb_pages", 0))
                        .put("marks", new org.json.JSONArray(sp.getString("hb_marks", "[]")).length())
                        .put("read", sp.contains("hb_at"))
                        .toString();
            } catch (Exception e) { return "{}"; }
        }

        @JavascriptInterface public String takeAction() {
            String a = pendingAction;
            pendingAction = null;
            return a;
        }

        @JavascriptInterface public void openWeb(String url, String title) {
            runOnUiThread(() -> openUrl(url, title));
        }

        @JavascriptInterface public void toast(String msg) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show());
        }

        @JavascriptInterface public String version() { return Updater.currentVersion(MainActivity.this); }

        /** Answers with window.onHttp(id, 200, json). */
        @JavascriptInterface public void checkUpdate(int id) {
            pool.execute(() -> reply("onHttp", id, 200, Updater.check(MainActivity.this).toString()));
        }

        /** Downloads + installs; progress arrives as window.onUpdateProgress(pct, state, error). */
        @JavascriptInterface public void installUpdate(String url) {
            Updater.Progress p = (pct, st, err) -> js("window.onUpdateProgress&&window.onUpdateProgress(" + pct + ","
                    + JSONObject.quote(st) + "," + JSONObject.quote(err == null ? "" : err) + ")");
            InstallReceiver.listener = p;
            runOnUiThread(() -> Updater.install(MainActivity.this, url, p));
        }

        @JavascriptInterface public boolean canPinWidget() {
            return Build.VERSION.SDK_INT >= 26 && AppWidgetManager.getInstance(MainActivity.this).isRequestPinAppWidgetSupported();
        }

        @JavascriptInterface public boolean hasWidget() {
            int[] ids = AppWidgetManager.getInstance(MainActivity.this)
                    .getAppWidgetIds(new ComponentName(MainActivity.this, ChartWidget.class));
            return ids != null && ids.length > 0;
        }

        @JavascriptInterface public void pinWidget() {
            if (Build.VERSION.SDK_INT < 26) return;
            runOnUiThread(() -> AppWidgetManager.getInstance(MainActivity.this)
                    .requestPinAppWidget(new ComponentName(MainActivity.this, ChartWidget.class), null, null));
        }

        @JavascriptInterface public boolean notifAllowed() {
            return Build.VERSION.SDK_INT < 33
                    || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        }

        @JavascriptInterface public void testReminder() {
            askNotifPermission();
            Reminders.notify(MainActivity.this, ChartWidget.daysClean(MainActivity.this, ChartWidget.summary(MainActivity.this)));
        }
    }

    private void askNotifPermission() {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            runOnUiThread(() -> requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 5));
        }
    }
}
