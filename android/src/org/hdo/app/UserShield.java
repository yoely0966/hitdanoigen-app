package org.hdo.app;

import android.content.Context;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/**
 * The site's server marks the day as "clean" on the 90-day chart every time the account's
 * profile (GET /auth/user) is read - even without pressing "update" (tested: the day's record
 * appeared 1.3 s after that request). So the app reads the profile once, keeps a copy, and
 * answers every later profile request from the copy - its own and the website pages shown
 * inside the app. The chart then changes only when the user really updates it.
 */
final class UserShield {
    private UserShield() {}

    static final String KEY = "userJson";

    static boolean isUserUrl(String url) {
        if (url == null) return false;
        Uri u = Uri.parse(url);
        return "api.app.hitdanoigen.com".equals(u.getHost()) && u.getPath() != null && u.getPath().replaceAll("/+$", "").equals("/auth/user");
    }

    static String cached(Context c) { return Store.get(c, KEY); }

    /** Keep the copy (and the streak start that the day counter uses). */
    static void save(Context c, String body) {
        try {
            JSONObject u = new JSONObject(body);
            if (!u.has("id")) return;
            Store.put(c, KEY, body);
            JSONObject ud = u.optJSONObject("userData");
            if (ud != null && !ud.isNull("streakStartDate")) {
                Store.put(c, "streakStart", ud.optString("streakStartDate"));
                Store.prefs(c).edit().putLong("streakStartAt", System.currentTimeMillis()).apply();
            }
            Store.put(c, "displayName", u.optString("username"));
        } catch (Exception ignored) {}
    }

    /** After a fall (from the app or found on the site): move the copy's streak start too. */
    static void setStreakStart(Context c, String iso) {
        try {
            String s = cached(c);
            if (s == null || iso == null) return;
            JSONObject u = new JSONObject(s);
            JSONObject ud = u.optJSONObject("userData");
            if (ud == null) { ud = new JSONObject(); u.put("userData", ud); }
            ud.put("streakStartDate", iso);
            save(c, u.toString());
        } catch (Exception ignored) {}
    }

    /** For WebViews: answer GET /auth/user from the copy (the first time, fetch it once and keep it). */
    static WebResourceResponse intercept(Context ctx, WebResourceRequest req) {
        if (!isUserUrl(req.getUrl().toString())) return null;
        Context app = ctx.getApplicationContext();
        String origin = header(req, "Origin");
        if (origin == null) origin = Auth.APP;
        Map<String, String> h = new HashMap<>();
        h.put("Access-Control-Allow-Origin", origin);
        h.put("Access-Control-Allow-Credentials", "true");
        h.put("Access-Control-Allow-Headers", "authorization, content-type, accept, accept-language");
        h.put("Access-Control-Allow-Methods", "GET, OPTIONS");
        h.put("Vary", "Origin");
        h.put("Cache-Control", "no-store");
        if ("OPTIONS".equalsIgnoreCase(req.getMethod())) return resp(204, "", h);
        if (!"GET".equalsIgnoreCase(req.getMethod())) return null;
        // An expired (or missing) login must get "logged out" - that's how the site's page knows to log
        // in again. Answered here too, so the site still never sees a profile read.
        String auth = header(req, "Authorization");
        String jwt = auth != null && auth.regionMatches(true, 0, "Bearer ", 0, 7) ? auth.substring(7).trim() : null;
        if (jwt == null || !Store.tokenFresh(jwt, 30)) return resp(401, "{\"statusCode\":401,\"message\":\"Unauthorized\"}", h);
        String body = cached(app);
        if (body == null) {
            // first time only: the real request, kept for next time
            body = fetch(req.getUrl().toString(), auth, origin);
            if (body == null) return null; // let the page try by itself
            save(app, body);
        }
        return resp(200, body, h);
    }

    private static String header(WebResourceRequest req, String name) {
        Map<String, String> m = req.getRequestHeaders();
        if (m == null) return null;
        for (Map.Entry<String, String> e : m.entrySet()) if (e.getKey() != null && e.getKey().equalsIgnoreCase(name)) return e.getValue();
        return null;
    }

    private static String fetch(String url, String auth, String origin) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(15_000);
            c.setReadTimeout(20_000);
            c.setRequestProperty("Accept", "application/json");
            c.setRequestProperty("Origin", origin);
            if (auth != null) c.setRequestProperty("Authorization", auth);
            if (c.getResponseCode() != 200) return null;
            try (InputStream in = c.getInputStream()) {
                java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
                return bo.toString("UTF-8");
            }
        } catch (Exception e) {
            return null;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private static WebResourceResponse resp(int code, String body, Map<String, String> headers) {
        WebResourceResponse r = new WebResourceResponse("application/json", "utf-8",
                new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8)));
        r.setStatusCodeAndReasonPhrase(code, code == 204 ? "No Content" : code == 401 ? "Unauthorized" : "OK");
        r.setResponseHeaders(headers);
        return r;
    }
}
