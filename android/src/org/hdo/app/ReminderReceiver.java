package org.hdo.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import org.json.JSONObject;

import java.util.Calendar;

/** Fires the daily reminders and re-arms them after reboot / app update / clock changes. */
public class ReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        Context app = ctx.getApplicationContext();
        Reminders.schedule(app); // always re-arm the next day first
        if (!Reminders.ACTION.equals(intent.getAction())) {
            ChartWidget.render(app);
            return;
        }
        JSONObject s = Store.settings(app);
        if (!s.optBoolean("remind") || !Store.loggedIn(app)) return;
        if (s.optBoolean("skipShabbos", true) && Reminders.isShabbos(Calendar.getInstance())) return;

        PendingResult pr = goAsync();
        new Thread(() -> {
            try {
                // only a quick check with the current token; if it can't tell, remind anyway
                JSONObject sum = Api.refreshSummary(app, false);
                if (sum == null) sum = ChartWidget.summary(app);
                ChartWidget.render(app);
                if (s.optBoolean("skipIfDone", true) && sum != null && ChartWidget.doneToday(sum)) return;
                Reminders.notify(app, ChartWidget.daysClean(app, sum));
            } finally {
                pr.finish();
            }
        }).start();
    }
}
