package org.hdo.app;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;

/** Daily "update your chart" reminders at the times chosen in the app's settings. */
public final class Reminders {
    static final String ACTION = "org.hdo.app.REMIND";
    static final String CHANNEL = "reminders";
    static final int NOTIF_ID = 90;
    static final int MAX = 4;

    private Reminders() {}

    /** Cancels all alarms and re-arms the next occurrence of every enabled reminder time. */
    static void schedule(Context ctx) {
        Context app = ctx.getApplicationContext();
        AlarmManager am = (AlarmManager) app.getSystemService(Context.ALARM_SERVICE);
        for (int i = 0; i < MAX; i++) am.cancel(pending(app, i));
        JSONObject s = Store.settings(app);
        if (!s.optBoolean("remind") || !Store.loggedIn(app)) return;
        JSONArray times = s.optJSONArray("times");
        if (times == null) return;
        for (int i = 0; i < Math.min(MAX, times.length()); i++) {
            long at = next(times.optString(i, "21:00"));
            if (at > 0) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending(app, i));
        }
    }

    private static PendingIntent pending(Context app, int i) {
        Intent it = new Intent(app, ReminderReceiver.class).setAction(ACTION).putExtra("i", i);
        return PendingIntent.getBroadcast(app, 100 + i, it, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static long next(String hhmm) {
        try {
            String[] p = hhmm.split(":");
            Calendar c = Calendar.getInstance();
            c.set(Calendar.HOUR_OF_DAY, Integer.parseInt(p[0]));
            c.set(Calendar.MINUTE, Integer.parseInt(p[1]));
            c.set(Calendar.SECOND, 0);
            c.set(Calendar.MILLISECOND, 0);
            if (c.getTimeInMillis() <= System.currentTimeMillis() + 5_000) c.add(Calendar.DAY_OF_YEAR, 1);
            return c.getTimeInMillis();
        } catch (Exception e) {
            return 0;
        }
    }

    /** Friday from 3pm until Sunday: no reminders. */
    static boolean isShabbos(Calendar c) {
        int d = c.get(Calendar.DAY_OF_WEEK);
        return d == Calendar.SATURDAY || (d == Calendar.FRIDAY && c.get(Calendar.HOUR_OF_DAY) >= 15);
    }

    static void notify(Context ctx, int days) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "רימיינדערס", NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription("טעגליכע רימיינדער צו אפדעיטן דעם 90-טעג טשארט");
            nm.createNotificationChannel(ch);
        }
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent open = PendingIntent.getActivity(ctx, 10,
                new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), flags);
        PendingIntent clean = PendingIntent.getActivity(ctx, 11,
                new Intent(ctx, CheckInActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK), flags);

        boolean wall = days >= 90;
        String title = wall ? "אפדעיט דיין וואנט פון כבוד" : "אפדעיט דיין 90-טעג טשארט";
        String body = (days > 0 ? days + " טעג ריין. " : "") + "ביסטו נאך אלץ ריין היינט? דריק צו אפדעיטן.";
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(ctx, CHANNEL) : new Notification.Builder(ctx);
        b.setSmallIcon(R.drawable.ic_stat)
                .setColor(0xFF7C3AED)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setContentIntent(open)
                .setAutoCancel(true)
                .addAction(new Notification.Action.Builder(null, "✓ איך בין ריין", clean).build())
                .addAction(new Notification.Action.Builder(null, "עפן די אפ", open).build());
        try {
            nm.notify(NOTIF_ID, b.build());
        } catch (SecurityException ignored) {
            // notification permission was revoked
        }
    }
}
