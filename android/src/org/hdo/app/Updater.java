package org.hdo.app;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import android.widget.Toast;

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

    /** {current, latest, available, url, notes} - blocking, background thread only. */
    static JSONObject check(Context c) {
        JSONObject out = new JSONObject();
        try {
            String cur = currentVersion(c);
            out.put("current", cur);
            Api.Resp r = Api.call(c, "GET", "https://api.github.com/repos/" + REPO + "/releases/latest", null, false);
            JSONObject rel = r.json();
            if (!r.ok() || rel == null) { out.put("error", r.status == 404 ? "no_releases" : "offline"); return out; }
            String latest = rel.optString("tag_name", "").replaceFirst("^[vV]", "");
            String url = null;
            JSONArray assets = rel.optJSONArray("assets");
            for (int i = 0; assets != null && i < assets.length(); i++) {
                JSONObject a = assets.getJSONObject(i);
                if (a.optString("name").toLowerCase().endsWith(".apk")) { url = a.optString("browser_download_url"); break; }
            }
            out.put("latest", latest);
            out.put("notes", rel.optString("body", ""));
            out.put("url", url);
            out.put("available", url != null && newer(latest, cur));
        } catch (Exception e) {
            try { out.put("error", "offline"); } catch (Exception ignored) {}
        }
        return out;
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

    static void install(Activity act, String url) {
        if (Build.VERSION.SDK_INT >= 26 && !act.getPackageManager().canRequestPackageInstalls()) {
            Toast.makeText(act, "ערלויב די אפ צו אינסטאלירן אפדעיטס, און דריק נאכאמאל", Toast.LENGTH_LONG).show();
            act.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + act.getPackageName())));
            return;
        }
        new java.io.File(act.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "hitdanoigen-update.apk").delete();
        DownloadManager dm = (DownloadManager) act.getSystemService(Context.DOWNLOAD_SERVICE);
        DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url))
                .setTitle("היט דיינע אויגן - אפדעיט")
                .setMimeType("application/vnd.android.package-archive")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
                .setDestinationInExternalFilesDir(act, Environment.DIRECTORY_DOWNLOADS, "hitdanoigen-update.apk");
        long id = dm.enqueue(req);
        Context app = act.getApplicationContext();
        BroadcastReceiver done = new BroadcastReceiver() {
            @Override public void onReceive(Context c, Intent i) {
                if (i.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1) != id) return;
                app.unregisterReceiver(this);
                Uri apk = dm.getUriForDownloadedFile(id);
                if (apk == null) {
                    Toast.makeText(app, "דאונלאוד האט נישט געקלאפט", Toast.LENGTH_LONG).show();
                    return;
                }
                Intent inst = new Intent(Intent.ACTION_VIEW)
                        .setDataAndType(apk, "application/vnd.android.package-archive")
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                app.startActivity(inst);
            }
        };
        IntentFilter f = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= 33) app.registerReceiver(done, f, Context.RECEIVER_EXPORTED);
        else app.registerReceiver(done, f);
        Toast.makeText(act, "מען דאונלאודט דעם אפדעיט...", Toast.LENGTH_SHORT).show();
    }
}
