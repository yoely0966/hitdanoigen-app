package org.hdo.app;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * New live-chat messages as phone notifications while the app is closed.
 * Every ~15 minutes it asks the chat server (only the chat server – never the 90-day chart)
 * which conversations have unread messages, and notifies once per new message.
 * Uses the saved login as is: if it has expired, it waits until the app is opened again.
 */
public class MsgReceiver extends BroadcastReceiver {
    static final String ACTION = "org.hdo.app.CHECK_MESSAGES";
    static final String CHANNEL = "messages";
    private static final long EVERY = 15 * 60_000L;
    private static final String Q = "{\"query\":\"query{ currentUser{ id } myConversations(limit:30){ id unreadMessageCount "
            + "conversationToUser{ isMuted } lastMessage{ id body authorId type state } participants{ id username } } }\"}";

    static void schedule(Context ctx) {
        Context app = ctx.getApplicationContext();
        AlarmManager am = (AlarmManager) app.getSystemService(Context.ALARM_SERVICE);
        PendingIntent pi = pending(app);
        am.cancel(pi);
        if (!enabled(app)) return;
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + EVERY, pi);
    }

    static boolean enabled(Context ctx) {
        return Store.loggedIn(ctx) && Store.settings(ctx).optBoolean("msgNotif", true);
    }

    private static PendingIntent pending(Context app) {
        Intent i = new Intent(app, MsgReceiver.class).setAction(ACTION);
        return PendingIntent.getBroadcast(app, 77, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        Context app = ctx.getApplicationContext();
        schedule(app); // re-arm first
        if (!ACTION.equals(intent.getAction()) || !enabled(app) || App.started > 0) return;
        PendingResult pr = goAsync();
        new Thread(() -> {
            try { check(app); } catch (Exception ignored) {} finally { pr.finish(); }
        }).start();
    }

    private static void check(Context app) throws Exception {
        if (!Store.tokenFresh(Store.token(app), 60)) return; // no background log-in
        Api.Resp r = Api.call(app, "POST", Api.CHAT + "/graphql", Q, false);
        JSONObject j = r.ok() ? r.json() : null;
        JSONObject data = j == null ? null : j.optJSONObject("data");
        if (data == null) return;
        String me = data.optJSONObject("currentUser") == null ? "" : data.optJSONObject("currentUser").optString("id");
        JSONArray convs = data.optJSONArray("myConversations");
        if (convs == null) return;
        JSONObject seen = new JSONObject(Store.prefs(app).getString("msgSeen", "{}"));
        for (int i = 0; i < convs.length(); i++) {
            JSONObject c = convs.getJSONObject(i);
            int unread = c.optInt("unreadMessageCount");
            JSONObject lm = c.optJSONObject("lastMessage");
            JSONObject cu = c.optJSONObject("conversationToUser");
            if (unread <= 0 || lm == null || (cu != null && cu.optBoolean("isMuted"))) continue;
            if (me.equals(lm.optString("authorId"))) continue;
            String cid = c.optString("id"), mid = lm.optString("id");
            if (mid.equals(seen.optString(cid))) continue; // already told about this one
            seen.put(cid, mid);
            String who = "";
            JSONArray ps = c.optJSONArray("participants");
            if (ps != null) for (int k = 0; k < ps.length(); k++) {
                JSONObject p = ps.getJSONObject(k);
                if (!me.equals(p.optString("id"))) { who = p.optString("username"); break; }
            }
            String body = "Voice".equals(lm.optString("type")) ? "🎤 קול-מעסעדזש" : lm.optString("body");
            if (unread > 1) body = body + "  (" + unread + " נייע)";
            show(app, cid, who.isEmpty() ? "לייוו טשעט" : who, body);
        }
        Store.prefs(app).edit().putString("msgSeen", seen.toString()).apply();
    }

    private static void show(Context app, String convId, String title, String text) {
        NotificationManager nm = (NotificationManager) app.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "נייע מעסעדזשעס", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("ווען איינער שרייבט דיר אין לייוו טשעט");
            nm.createNotificationChannel(ch);
        }
        Intent open = new Intent(app, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra("action", "chat:" + convId);
        int id = 3000 + (Math.abs(convId.hashCode()) % 5000);
        PendingIntent pi = PendingIntent.getActivity(app, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(app, CHANNEL) : new Notification.Builder(app);
        b.setSmallIcon(R.drawable.ic_stat)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setColor(0xFF8B62FF)
                .setAutoCancel(true)
                .setCategory(Notification.CATEGORY_MESSAGE)
                .setContentIntent(pi);
        try { nm.notify(id, b.build()); } catch (SecurityException ignored) {}
    }
}
