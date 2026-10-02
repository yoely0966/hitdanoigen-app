package org.hdo.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/** Home-screen widget: days clean, level, today's status and a button that updates the chart. */
public class ChartWidget extends AppWidgetProvider {
    static final int[] LEVEL_DAYS = {1, 3, 7, 14, 30, 50, 70, 90, 180, 365};

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        // No network here: reading the site's dashboard in the background makes the site count
        // the day as updated on the 90-day chart. The day count ticks locally from the streak start;
        // fresh numbers come when the app is opened or the chart is updated.
        render(ctx);
    }

    /** Fetch fresh numbers in the background, then redraw every widget. */
    static void refreshAsync(Context ctx) {
        Context app = ctx.getApplicationContext();
        render(app);
        new Thread(() -> { Api.refreshSummary(app, true); render(app); }).start();
    }

    static void render(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, ChartWidget.class));
        if (ids == null || ids.length == 0) return;

        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_chart);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        Intent open = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        v.setOnClickPendingIntent(R.id.w_root, PendingIntent.getActivity(ctx, 1, open, flags));

        if (!Store.loggedIn(ctx)) {
            v.setTextViewText(R.id.w_days, "—");
            v.setTextViewText(R.id.w_label, "");
            v.setTextViewText(R.id.w_level, "");
            v.setTextViewText(R.id.w_status, "עפן די עפפ און לאג זיך איין");
            v.setTextViewText(R.id.w_btn, "לאג איין");
            v.setOnClickPendingIntent(R.id.w_btn, PendingIntent.getActivity(ctx, 2, open, flags));
            mgr.updateAppWidget(ids, v);
            return;
        }

        JSONObject sum = summary(ctx);
        int days = daysClean(ctx, sum);
        boolean done = doneToday(sum);
        v.setTextViewText(R.id.w_days, days >= 0 ? String.valueOf(days) : "—");
        v.setTextViewText(R.id.w_label, days == 1 ? "טאג ריין" : "טעג ריין");
        int lvl = level(Math.max(days, 0));
        String rank = sum != null ? sum.optString("rank", "") : "";
        v.setTextViewText(R.id.w_level, (lvl > 0 ? "שטאפל " + lvl : "") + (rank.isEmpty() ? "" : "\n#" + rank));
        v.setTextViewText(R.id.w_status, done ? "✓ דער טשארט איז אפדעיטעד פאר היינט" : "נאכנישט אפדעיטעד היינט");
        v.setTextViewText(R.id.w_btn, done ? "✓  אפדעיטעד" : "✓  אפדעיט דעם טשארט");
        v.setInt(R.id.w_btn, "setBackgroundResource", done ? R.drawable.widget_btn_done : R.drawable.widget_btn);
        Intent ci = new Intent(ctx, CheckInActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        v.setOnClickPendingIntent(R.id.w_btn, PendingIntent.getActivity(ctx, 3, ci, flags));
        mgr.updateAppWidget(ids, v);
    }

    static JSONObject summary(Context ctx) {
        try {
            String s = Store.get(ctx, "summary");
            return s == null ? null : new JSONObject(s);
        } catch (Exception e) {
            return null;
        }
    }

    /** Counted from the streak start so the number ticks over even without internet. */
    static int daysClean(Context ctx, JSONObject sum) {
        long start = parseIso(Store.get(ctx, "streakStart"));
        if (start > 0) return (int) Math.max(0, (System.currentTimeMillis() - start) / 86_400_000L);
        return sum != null && sum.has("streak") ? sum.optInt("streak") : -1;
    }

    static boolean doneToday(JSONObject sum) {
        if (sum == null) return false;
        long at = sum.optLong("at");
        if (sum.optBoolean("done") && System.currentTimeMillis() - at < 3 * 3600_000L) return true;
        long upd = parseIso(sum.optString("updatedAt", null));
        return upd > 0 && sameDay(upd, System.currentTimeMillis());
    }

    static int level(int days) {
        int l = 0;
        for (int i = 0; i < LEVEL_DAYS.length; i++) if (days >= LEVEL_DAYS[i]) l = i + 1;
        return l;
    }

    static boolean sameDay(long a, long b) {
        Calendar x = Calendar.getInstance(), y = Calendar.getInstance();
        x.setTimeInMillis(a);
        y.setTimeInMillis(b);
        return x.get(Calendar.YEAR) == y.get(Calendar.YEAR) && x.get(Calendar.DAY_OF_YEAR) == y.get(Calendar.DAY_OF_YEAR);
    }

    static long parseIso(String s) {
        if (s == null || s.isEmpty() || s.equals("null")) return 0;
        String[] fmts = {"yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", "yyyy-MM-dd'T'HH:mm:ss'Z'"};
        for (String f : fmts) {
            try {
                SimpleDateFormat df = new SimpleDateFormat(f, Locale.US);
                df.setTimeZone(TimeZone.getTimeZone("UTC"));
                Date d = df.parse(s);
                if (d != null) return d.getTime();
            } catch (Exception ignored) {}
        }
        return 0;
    }
}
