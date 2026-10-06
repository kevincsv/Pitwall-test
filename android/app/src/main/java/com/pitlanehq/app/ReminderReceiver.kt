package com.pitlanehq.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Shows a race reminder. */
class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(c: Context, intent: Intent) {
        val nm = c.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel("races", c.getString(R.string.channel_races), NotificationManager.IMPORTANCE_HIGH))
        val open = PendingIntent.getActivity(c, 0, Intent(c, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val n = Notification.Builder(c, "races")
            .setSmallIcon(R.drawable.ic_flag)
            .setContentTitle(intent.getStringExtra("title") ?: c.getString(R.string.app_name))
            .setContentText(intent.getStringExtra("text") ?: "")
            .setContentIntent(open)
            .setAutoCancel(true)
            .setCategory(Notification.CATEGORY_REMINDER)
            .build()
        try { nm.notify(1000 + intent.getIntExtra("id", 0), n) } catch (e: SecurityException) { /* notifications not allowed */ }
        RacesWidget.refreshAll(c)
    }
}

/** Puts the reminders back after the phone restarts. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(c: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            Races.scheduleReminders(c)
            RacesWidget.refreshAll(c)
        }
    }
}
