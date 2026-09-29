package org.hdo.app;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * In-app updates without a server of our own: reads the newest GitHub release of the app's repo,
 * downloads its .apk with DownloadManager and hands it to the system installer.
 */
public final class Updater {
    /** GitHub "owner/repo" whose releases carry the APK. */
    static final String REPO = "yoely0966/hitdanoigen-app";

    private Updater() {}

    static String currentVersion(Context c) {
        try {
            return c.getPackageManager().getPackageInfo(c.getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "0";
        }
    }

    /**
     * {current, latest, available, url, notes} - blocking, background thread only.
     * The newest tag comes from github.com/.../releases/latest (a redirect, no rate limit);
     * the GitHub API (60 calls/hour per connection) is only asked for the release notes.
     */
    static JSONObject check(Context c) {
        JSONObject out = new JSONObject();
        try {
            String cur = currentVersion(c);
            out.put("current", cur);
            String tag = latestTag();
            if (tag == null) { out.put("error", "no_releases"); return out; }
            String latest = tag.replaceFirst("^[vV]", "");
            String url = "https://github.com/" + REPO + "/releases/download/" + tag + "/HitDaneOigen-" + latest + ".apk";
            String notes = "";
            try {
                Api.Resp r = Api.call(c, "GET", "https://api.github.com/repos/" + REPO + "/releases/tags/" + tag, null, false);
                JSONObject rel = r.json();
                if (r.ok() && rel != null) {
                    notes = rel.optString("body", "");
                    JSONArray assets = rel.optJSONArray("assets");
                    for (int i = 0; assets != null && i < assets.length(); i++) {
                        JSONObject a = assets.getJSONObject(i);
                        if (a.optString("name").toLowerCase().endsWith(".apk")) { url = a.optString("browser_download_url"); break; }
                    }
                }
            } catch (Exception ignored) {
                // no notes this time - the update itself still works
            }
            out.put("latest", latest);
            out.put("notes", notes);
            out.put("url", url);
            out.put("available", newer(latest, cur));
        } catch (Exception e) {
            try { out.put("error", "offline"); } catch (Exception ignored) {}
        }
        return out;
    }

    /** "v1.7.3" from the redirect of /releases/latest, or null when there are no releases. */
    private static String latestTag() throws Exception {
        java.net.HttpURLConnection h = (java.net.HttpURLConnection)
                new java.net.URL("https://github.com/" + REPO + "/releases/latest").openConnection();
        h.setInstanceFollowRedirects(false);
        h.setConnectTimeout(15_000);
        h.setReadTimeout(15_000);
        h.setRequestProperty("User-Agent", "HitDaneOigen-Updater");
        try {
            int code = h.getResponseCode();
            String loc = h.getHeaderField("Location");
            if (code >= 300 && code < 400 && loc != null && loc.contains("/releases/tag/")) {
                return java.net.URLDecoder.decode(loc.substring(loc.lastIndexOf('/') + 1), "UTF-8");
            }
            if (code == 404 || (loc != null && loc.endsWith("/releases"))) return null;
            throw new Exception("http_" + code);
        } finally {
            h.disconnect();
        }
    }

    static boolean newer(String a, String b) {
        String[] x = a.split("\\."), y = b.split("\\.");
        for (int i = 0; i < Math.max(x.length, y.length); i++) {
            int p = i < x.length ? num(x[i]) : 0, q = i < y.length ? num(y[i]) : 0;
            if (p != q) return p > q;
        }
        return false;
    }

    private static int num(String s) {
        try { return Integer.parseInt(s.replaceAll("\\D.*", "")); } catch (Exception e) { return 0; }
    }

    /** Progress back to the page: state = "download" | "install" | "perm" | "error". */
    interface Progress { void on(int pct, String state, String error); }

    /**
     * Downloads the APK ourselves (follows GitHub's redirects, shows progress) and hands it to
     * Android's own PackageInstaller - no DownloadManager, no file URIs, works on every phone.
     */
    static void install(Activity act, String url, Progress p) {
        if (Build.VERSION.SDK_INT >= 26 && !act.getPackageManager().canRequestPackageInstalls()) {
            act.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + act.getPackageName())));
            p.on(0, "perm", null);
            return;
        }
        Context app = act.getApplicationContext();
        new Thread(() -> {
            java.io.File f = new java.io.File(app.getCacheDir(), "update.apk");
            try {
                download(app, url, f, pct -> p.on(pct, "download", null));
                android.content.pm.PackageInfo info = app.getPackageManager().getPackageArchiveInfo(f.getPath(), 0);
                if (info == null || !app.getPackageName().equals(info.packageName)) throw new Exception("bad_file");
                p.on(100, "install", null);
                android.content.pm.PackageInstaller pi = app.getPackageManager().getPackageInstaller();
                android.content.pm.PackageInstaller.SessionParams params =
                        new android.content.pm.PackageInstaller.SessionParams(android.content.pm.PackageInstaller.SessionParams.MODE_FULL_INSTALL);
                params.setAppPackageName(app.getPackageName());
                params.setSize(f.length());
                int sid = pi.createSession(params);
                try (android.content.pm.PackageInstaller.Session session = pi.openSession(sid)) {
                    try (java.io.InputStream in = new java.io.FileInputStream(f);
                         java.io.OutputStream out = session.openWrite("base.apk", 0, f.length())) {
                        byte[] buf = new byte[65536];
                        int n;
                        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                        session.fsync(out);
                    }
                    int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
                    PendingIntent done = PendingIntent.getBroadcast(app, sid, new Intent(app, InstallReceiver.class), flags);
                    session.commit(done.getIntentSender());
                }
            } catch (Exception e) {
                f.delete();
                p.on(0, "error", String.valueOf(e.getMessage()));
            }
        }).start();
    }

    interface Pct { void on(int pct); }

    private static void download(Context app, String url, java.io.File to, Pct pct) throws Exception {
        String next = url;
        for (int hop = 0; hop < 6; hop++) {
            java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(next).openConnection();
            c.setInstanceFollowRedirects(false); // GitHub hops github.com -> release-assets host; follow by hand
            c.setConnectTimeout(20_000);
            c.setReadTimeout(30_000);
            c.setRequestProperty("User-Agent", "HitDaneOigen-Updater");
            c.setRequestProperty("Accept", "application/octet-stream");
            int code = c.getResponseCode();
            if (code >= 300 && code < 400) {
                next = new java.net.URL(new java.net.URL(next), c.getHeaderField("Location")).toString();
                c.disconnect();
                continue;
            }
            if (code != 200) { c.disconnect(); throw new Exception("http_" + code); }
            long total = c.getContentLengthLong();
            try (java.io.InputStream in = c.getInputStream(); java.io.OutputStream out = new java.io.FileOutputStream(to)) {
                byte[] buf = new byte[32768];
                long got = 0;
                int n, last = -1;
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n);
                    got += n;
                    int p = total > 0 ? (int) (got * 100 / total) : -1;
                    if (p != last) { last = p; pct.on(p); }
                }
                if (total > 0 && got != total) throw new Exception("incomplete");
            } finally {
                c.disconnect();
            }
            return;
        }
        throw new Exception("too_many_redirects");
    }
}
