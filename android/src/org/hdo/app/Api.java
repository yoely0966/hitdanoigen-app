package org.hdo.app;

import android.content.Context;
import android.webkit.CookieManager;
import android.webkit.WebSettings;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/**
 * Talks straight to the website from the phone: the JSON API with the bearer token, and the forum /
 * chart pages with the WebView's cookies. Renews the 1-day token by itself when it runs out.
 * Blocking - call from a background thread.
 */
public final class Api {
    static final String API = "https://api.app.hitdanoigen.com";
    /** live chat (GraphQL) - same bearer token as the app API */
    static final String CHAT = "https://api.chat.hitdanoigen.com";

    static final class Resp {
        final int status;
        final String body;
        Resp(int status, String body) { this.status = status; this.body = body; }
        boolean ok() { return status >= 200 && status < 300; }
        JSONObject json() {
            try { return new JSONObject(body); } catch (Exception e) { return null; }
        }
    }

    private static String userAgent;

    private Api() {}

    static Resp call(Context ctx, String method, String url, String body) {
        return call(ctx, method, url, body, true);
    }

    static Resp call(Context ctx, String method, String url, String body, boolean mayRefresh) {
        return call(ctx, method, url, body, mayRefresh, "application/json");
    }

    static Resp call(Context ctx, String method, String url, String body, boolean mayRefresh, String contentType) {
        Context app = ctx.getApplicationContext();
        boolean api = url.startsWith(API) || url.startsWith(CHAT);
        if (url.startsWith(API) && !url.contains("language=")) url += (url.contains("?") ? "&" : "?") + "language=yi";

        if (api && mayRefresh && !Store.tokenFresh(Store.token(app), 60)) Auth.refreshBlocking(app);
        Resp r = raw(app, method, url, body, contentType);
        if (!mayRefresh) return r;

        boolean needLogin = api ? r.status == 401
                : r.ok() && r.body != null && r.body.contains("com-form-login") && !r.body.contains("logout-button");
        // (form posts carry a session token, so they can't simply be replayed after a re-login)
        if (needLogin && "GET".equals(method) || needLogin && api) {
            if (Auth.refreshBlocking(app)) r = raw(app, method, url, body, contentType);
        }
        return r;
    }

    static Resp get(Context ctx, String pathOrUrl) {
        return call(ctx, "GET", pathOrUrl.startsWith("http") ? pathOrUrl : API + pathOrUrl, null);
    }

    private static Resp raw(Context app, String method, String url, String body, String contentType) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(15_000);
            c.setReadTimeout(25_000);
            c.setRequestMethod(method);
            c.setInstanceFollowRedirects(true);
            c.setRequestProperty("User-Agent", ua(app));
            c.setRequestProperty("Accept-Language", "yi,en;q=0.8");
            if (url.startsWith(API) || url.startsWith(CHAT)) {
                c.setRequestProperty("Accept", "application/json");
                c.setRequestProperty("Origin", Auth.APP);
                c.setRequestProperty("Referer", Auth.APP + "/");
                String t = Store.token(app);
                if (t != null) c.setRequestProperty("Authorization", "Bearer " + t);
            } else {
                String ck = CookieManager.getInstance().getCookie(url);
                if (ck != null) c.setRequestProperty("Cookie", ck);
            }
            if (body != null && !body.isEmpty()) {
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", contentType);
                try (OutputStream os = c.getOutputStream()) {
                    os.write(body.getBytes(StandardCharsets.UTF_8));
                }
            }
            int code = c.getResponseCode();
            if (url.startsWith(Auth.SITE)) storeCookies(url, c.getHeaderFields());
            InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
            return new Resp(code, in == null ? "" : read(in));
        } catch (Exception e) {
            return new Resp(0, "{\"error\":" + JSONObject.quote(String.valueOf(e.getMessage())) + "}");
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private static void storeCookies(String url, Map<String, List<String>> headers) {
        if (headers == null) return;
        for (Map.Entry<String, List<String>> e : headers.entrySet()) {
            if (e.getKey() != null && e.getKey().equalsIgnoreCase("Set-Cookie")) {
                for (String v : e.getValue()) CookieManager.getInstance().setCookie(url, v);
            }
        }
    }

    private static String read(InputStream in) throws Exception {
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
        in.close();
        return bo.toString("UTF-8");
    }

    private static synchronized String ua(Context app) {
        if (userAgent == null) {
            try { userAgent = WebSettings.getDefaultUserAgent(app); }
            catch (Exception e) { userAgent = "Mozilla/5.0 (Linux; Android) HitDaneOigenApp"; }
        }
        return userAgent;
    }

    // ---- shared helpers used by the widget, reminders and check-in dialog ----

    /** Posts today's check-in. setbackIso == null means "still clean". Returns the API reply or null. */
    static JSONObject checkIn(Context ctx, String setbackIso) {
        try {
            JSONObject b = new JSONObject();
            b.put("isSetback", setbackIso != null);
            if (setbackIso != null) b.put("setbackDate", setbackIso);
            Resp r = call(ctx, "POST", API + "/daily-check-in", b.toString());
            if (!r.ok()) return null;
            // a setback moves the streak start; make the next summary re-read it
            if (setbackIso != null) Store.prefs(ctx).edit().putLong("streakStartAt", 0).apply();
            JSONObject o = r.json();
            return o == null ? new JSONObject() : o;
        } catch (Exception e) {
            return null;
        }
    }

    /** Refreshes the cached dashboard + streak start used by the widget and reminders. */
    static JSONObject refreshSummary(Context ctx, boolean mayRefresh) {
        Context app = ctx.getApplicationContext();
        Resp d = call(app, "GET", API + "/dashboard", null, mayRefresh);
        if (!d.ok() || d.json() == null) return null;
        try {
            JSONObject dash = d.json();
            JSONObject stats = dash.optJSONObject("stats");
            JSONObject sum = new JSONObject();
            if (stats != null) {
                sum.put("streak", stats.optInt("cleanDaysStreak"));
                sum.put("done", stats.optBoolean("checkInCompleted"));
                sum.put("clean", stats.optInt("cleanDaysCount"));
            }
            JSONObject lb = dash.optJSONObject("leaderboard");
            if (lb != null) { sum.put("rank", lb.optString("rank")); sum.put("of", lb.optInt("usersCount")); }
            sum.put("level", dash.optInt("level"));
            JSONObject ci = dash.optJSONObject("dailyCheckIn");
            if (ci != null) sum.put("updatedAt", ci.optString("updatedAt"));

            String start = Store.get(app, "streakStart");
            long age = System.currentTimeMillis() - Store.prefs(app).getLong("streakStartAt", 0);
            if (start == null || age > 6 * 3600_000L) {
                Resp u = call(app, "GET", API + "/auth/user", null, false);
                JSONObject uj = u.json();
                if (u.ok() && uj != null) {
                    JSONObject ud = uj.optJSONObject("userData");
                    if (ud != null && !ud.isNull("streakStartDate")) {
                        Store.put(app, "streakStart", ud.optString("streakStartDate"));
                        Store.prefs(app).edit().putLong("streakStartAt", System.currentTimeMillis()).apply();
                    }
                    Store.put(app, "displayName", uj.optString("username"));
                }
            }
            sum.put("at", System.currentTimeMillis());
            Store.put(app, "summary", sum.toString());
            return sum;
        } catch (Exception e) {
            return null;
        }
    }
}
