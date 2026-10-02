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
        MsgReceiver.schedule(app);
        if (!Reminders.ACTION.equals(intent.getAction())) {
            ChartWidget.render(app);
            return;
        }
        JSONObject s = Store.settings(app);
        if (!s.optBoolean("remind") || !Store.loggedIn(app)) return;
        if (s.optBoolean("skipShabbos", true) && Reminders.isShabbos(Calendar.getInstance())) return;

        // Uses only what the phone already knows: asking the site here would itself mark the day
        // as updated on the 90-day chart.
        JSONObject sum = ChartWidget.summary(app);
        ChartWidget.render(app);
        if (s.optBoolean("skipIfDone", true) && sum != null && ChartWidget.doneToday(sum)) return;
        Reminders.notify(app, ChartWidget.daysClean(app, sum));
    }
}
