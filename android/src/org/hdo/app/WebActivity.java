package org.hdo.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

/** The full website (forum, live chat, lessons...) inside the app, already logged in. */
public class WebActivity extends Activity {
    private static final int PICK = 7;
    private WebView web;
    private TextView title;
    private ProgressBar bar;
    private ValueCallback<Uri[]> pickCb;
    private boolean ranJs;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        boolean dark = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        int bg = Color.parseColor(dark ? "#13111C" : "#F6F5FB");
        int ink = Color.parseColor(dark ? "#F1EFFA" : "#1E1B2E");
        int accent = Color.parseColor(dark ? "#A78BFA" : "#7C3AED");

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(bg);

        LinearLayout top = new LinearLayout(this);
        top.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setPadding(dp(6), dp(4), dp(6), dp(4));
        TextView close = iconButton("✕", ink);
        close.setOnClickListener(v -> finish());
        title = new TextView(this);
        title.setTextColor(ink);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setSingleLine(true);
        title.setEllipsize(android.text.TextUtils.TruncateAt.END);
        title.setText(getIntent().getStringExtra("title"));
        TextView reload = iconButton("⟳", ink);
        reload.setOnClickListener(v -> web.reload());
        top.addView(close);
        top.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        top.addView(reload);
        root.addView(top);

        bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        bar.setMax(100);
        bar.setProgressTintList(android.content.res.ColorStateList.valueOf(accent));
        root.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3)));

        web = new WebView(this);
        root.addView(web, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(root);
        Edge.edgeToEdge(getWindow());
        Edge.lightBars(getWindow(), !dark);
        Edge.pad(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportMultipleWindows(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
        if (getIntent().getBooleanExtra("browserUA", false)) {
            // Google sign-in refuses app-embedded browsers' identity; use the phone's normal Chrome one
            s.setUserAgentString(s.getUserAgentString().replace("; wv", "").replaceAll("Version/[\\d.]+ ", ""));
        }

        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                String host = u.getHost() == null ? "" : u.getHost();
                String scheme = u.getScheme() == null ? "" : u.getScheme();
                if ((scheme.equals("http") || scheme.equals("https")) && isSite(host)) return false;
                if (getIntent().getBooleanExtra("capture", false) && (scheme.equals("http") || scheme.equals("https"))) return false;
                // phone numbers, mail, other websites -> the phone's own apps
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) {}
                return true;
            }

            @Override public void onPageFinished(WebView v, String url) {
                CookieManager.getInstance().flush();
                embed(v, url);
                if (getIntent().getBooleanExtra("capture", false)) capture(v, url);
                String extra = getIntent().getStringExtra("js");
                if (extra != null && !ranJs) { ranJs = true; v.evaluateJavascript(extra, null); }
                if (getIntent().getStringExtra("title") == null) title.setText(v.getTitle());
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView v, int p) {
                bar.setProgress(p);
                bar.setVisibility(p >= 100 ? View.INVISIBLE : View.VISIBLE);
            }

            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (pickCb != null) pickCb.onReceiveValue(null);
                pickCb = cb;
                try {
                    startActivityForResult(p.createIntent(), PICK);
                } catch (Exception e) {
                    pickCb = null;
                    return false;
                }
                return true;
            }
        });

        String url = getIntent().getStringExtra("url");
        web.loadUrl(url != null ? url : Auth.APP + "/");
    }

    /**
     * Sign-up mode: once the site shows its dashboard (the user finished signing up / logging in),
     * take the login token it stored, so the app is logged in too - no second login needed.
     */
    private void capture(WebView v, String url) {
        Uri u = Uri.parse(url);
        String path = u.getPath() == null ? "" : u.getPath();
        if ("hitdanoigen.com".equals(u.getHost()) && !path.startsWith("/login") && !path.contains("/gyeuser/login")) {
            v.loadUrl(Auth.APP + "/");
            return;
        }
        if (!"app.hitdanoigen.com".equals(u.getHost()) || path.startsWith("/signup") || path.startsWith("/signin")
                || path.startsWith("/login") || path.startsWith("/verification") || path.startsWith("/onboarding")) return;
        v.evaluateJavascript("localStorage.getItem('token')", val -> {
            String t = Auth.unquote(val);
            if (t == null || t.split("\\.").length != 3 || !Store.tokenFresh(t, 60)) return;
            Store.setToken(this, t);
            ChartWidget.refreshAsync(this);
            android.widget.Toast.makeText(this, "דו ביסט איינגעלאגט ✓", android.widget.Toast.LENGTH_SHORT).show();
            finish();
        });
    }

    /** Makes the site's pages feel built in: no site header bar, no floating chat bubble. */
    static final String EMBED_JS = "(function(){var id='hdo-embed';if(document.getElementById(id))return;"
            + "var s=document.createElement('style');s.id=id;s.textContent="
            + "'header.MuiAppBar-root{display:none!important}main{padding-top:0!important}"
            + ".intercom-lightweight-app,chat-widget,#chat-widget-wrapper,#chat-icon-skeleton{display:none!important}';"
            + "(document.head||document.documentElement).appendChild(s);})()";

    private void embed(WebView v, String url) {
        Uri u = Uri.parse(url);
        // keep the site's own messenger visible when we opened it on purpose
        if ("app.hitdanoigen.com".equals(u.getHost()) && getIntent().getStringExtra("js") == null) v.evaluateJavascript(EMBED_JS, null);
    }

    static boolean isSite(String host) {
        return host.equals("hitdanoigen.com") || host.endsWith(".hitdanoigen.com")
                || host.endsWith("intercom.io") || host.endsWith("intercomcdn.com");
    }

    @Override
    protected void onResume() {
        super.onResume();
        // locked app: go back through the main screen, which asks for the fingerprint
        if (AppLock.needed(this)) {
            startActivity(new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            finish();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == PICK && pickCb != null) {
            pickCb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data));
            pickCb = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (web != null) { ((ViewGroup) web.getParent()).removeView(web); web.destroy(); }
        super.onDestroy();
    }

    private TextView iconButton(String s, int color) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextColor(color);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        t.setGravity(Gravity.CENTER);
        t.setLayoutParams(new LinearLayout.LayoutParams(dp(44), dp(44)));
        return t;
    }

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }
}
