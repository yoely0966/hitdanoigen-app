package org.hdo.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.widget.Toast;

/** Result of an in-app update: shows Android's "Update this app?" dialog, or the error. */
public class InstallReceiver extends BroadcastReceiver {
    /** Set by MainActivity so the page can show the outcome. */
    static volatile Updater.Progress listener;

    @Override
    @SuppressWarnings("deprecation")
    public void onReceive(Context ctx, Intent intent) {
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirm != null) {
                confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(confirm);
            }
            return;
        }
        if (status == PackageInstaller.STATUS_SUCCESS) return; // the app restarts as the new version
        String msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
        String reason = status == PackageInstaller.STATUS_FAILURE_ABORTED ? "aborted"
                : status == PackageInstaller.STATUS_FAILURE_CONFLICT ? "conflict"
                : status == PackageInstaller.STATUS_FAILURE_STORAGE ? "storage"
                : status == PackageInstaller.STATUS_FAILURE_INCOMPATIBLE ? "incompatible"
                : "failed";
        Updater.Progress l = listener;
        if (l != null) l.on(0, "error", reason + (msg != null ? ": " + msg : ""));
        else if (!"aborted".equals(reason)) Toast.makeText(ctx, "דער אפדעיט האט נישט געקלאפט", Toast.LENGTH_LONG).show();
    }
}
