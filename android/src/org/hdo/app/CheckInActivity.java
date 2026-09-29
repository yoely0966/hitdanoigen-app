package org.hdo.app;

import android.app.Activity;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import org.json.JSONObject;

/**
 * Small confirm dialog behind the widget button and the reminder notification:
 * "Still clean today?" -> posts the daily check-in (updates the 90-day chart / Wall of Honor).
 * A setback always goes through the full app so the date can be chosen.
 */
public class CheckInActivity extends Activity {
    private LinearLayout box;
    private boolean dark;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        dark = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).cancel(Reminders.NOTIF_ID);
        box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        box.setPadding(dp(24), dp(24), dp(24), dp(20));
        setContentView(box);

        if (!Store.loggedIn(this)) { openApp(null); return; }
        ask();
    }

    private void ask() {
        box.removeAllViews();
        int days = ChartWidget.daysClean(this, ChartWidget.summary(this));
        boolean done = ChartWidget.doneToday(ChartWidget.summary(this));
        box.addView(text(days >= 0 ? days + " טעג ריין" : "דיין 90-טעג טשארט", 26, true, accent()));
        box.addView(text(done ? "דו האסט שוין אפדעיטעד היינט. ווילסטו עס נאכאמאל קאנפירמען?"
                : "ביסטו נאך אלץ ריין? אפדעיט דיין טשארט און וואנט פון כבוד.", 16, false, ink()), lp(dp(8), dp(20)));
        box.addView(button("✓  יא, איך בין נאך אלץ ריין", true, v -> send()), lp(0, dp(10)));
        box.addView(button("איך האב געהאט א דורכפאל", false, v -> openApp("setback")), lp(0, dp(10)));
        box.addView(button("שפעטער", false, v -> finish()), lp(0, 0));
    }

    private void send() {
        box.removeAllViews();
        ProgressBar pb = new ProgressBar(this);
        box.addView(pb, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(64)));
        box.addView(text("מען אפדעיט...", 16, false, ink()));
        new Thread(() -> {
            JSONObject r = Api.checkIn(this, null);
            if (r != null) Api.refreshSummary(this, false);
            new Handler(Looper.getMainLooper()).post(() -> {
                if (isFinishing()) return;
                ChartWidget.render(this);
                box.removeAllViews();
                if (r == null) {
                    box.addView(text("עס האט נישט געקלאפט", 22, true, Color.parseColor("#DC2626")));
                    box.addView(text("קוק צי דו ביסט פארבינדן צום אינטערנעט און פרוביר נאכאמאל.", 15, false, ink()), lp(dp(8), dp(18)));
                    box.addView(button("פרוביר נאכאמאל", true, v -> send()), lp(0, dp(10)));
                    box.addView(button("צומאכן", false, v -> finish()), lp(0, 0));
                    return;
                }
                int streak = r.optInt("cleanDaysStreak", ChartWidget.daysClean(this, ChartWidget.summary(this)));
                box.addView(text("🎉", 44, false, ink()));
                box.addView(text(streak + " טעג ריין!", 26, true, accent()));
                String rank = r.optString("rank", "");
                box.addView(text("דער טשארט איז אפדעיטעד. האלט אזוי ווייטער!" + (rank.isEmpty() || rank.equals("null") ? "" : "\nדו ביסט #" + rank),
                        15, false, ink()), lp(dp(8), dp(18)));
                box.addView(button("שיין!", true, v -> finish()), lp(0, 0));
                new Handler(Looper.getMainLooper()).postDelayed(() -> { if (!isFinishing()) finish(); }, 6000);
            });
        }).start();
    }

    private void openApp(String action) {
        Intent i = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (action != null) i.putExtra("action", action);
        startActivity(i);
        finish();
    }

    private int accent() { return Color.parseColor(dark ? "#A78BFA" : "#7C3AED"); }
    private int ink() { return Color.parseColor(dark ? "#F1EFFA" : "#1E1B2E"); }

    private TextView text(String s, int sp, boolean bold, int color) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        t.setGravity(Gravity.CENTER);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private Button button(String s, boolean primary, View.OnClickListener l) {
        Button bt = new Button(this);
        bt.setText(s);
        bt.setAllCaps(false);
        bt.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        bt.setTextColor(primary ? Color.WHITE : accent());
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(16));
        if (primary) bg.setColor(accent());
        else { bg.setColor(Color.TRANSPARENT); bg.setStroke(dp(1), accent()); }
        bt.setBackground(bg);
        bt.setStateListAnimator(null);
        bt.setMinHeight(dp(50));
        bt.setOnClickListener(l);
        return bt;
    }

    private LinearLayout.LayoutParams lp(int top, int bottom) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        p.topMargin = top;
        p.bottomMargin = bottom;
        return p;
    }

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }
}
