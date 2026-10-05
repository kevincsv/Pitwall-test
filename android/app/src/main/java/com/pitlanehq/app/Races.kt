package com.pitlanehq.app

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject

/** The races planned in the app, kept on the phone for reminders and the widget. */
object Races {
    data class Race(val start: Long, val minutes: Int, val title: String, val detail: String) {
        val end get() = start + minutes * 60_000L
    }

    private fun prefs(c: Context) = c.getSharedPreferences("races", Context.MODE_PRIVATE)

    fun save(c: Context, msg: JSONObject) {
        prefs(c).edit()
            .putString("items", (msg.optJSONArray("items") ?: JSONArray()).toString())
            .putString("leads", (msg.optJSONArray("leads") ?: JSONArray("[15]")).toString())
            .putBoolean("es", msg.optString("lang") == "es")
            .apply()
    }

    fun spanish(c: Context) = prefs(c).getBoolean("es", false)

    fun load(c: Context): List<Race> {
        val arr = try { JSONArray(prefs(c).getString("items", "[]")) } catch (e: Exception) { JSONArray() }
        return (0 until arr.length()).mapNotNull { i ->
            val o = arr.optJSONObject(i) ?: return@mapNotNull null
            Race(o.optDouble("t").toLong(), o.optInt("mins", 60), o.optString("title"), o.optString("body"))
        }.sortedBy { it.start }
    }

    private fun leads(c: Context): List<Int> {
        val arr = try { JSONArray(prefs(c).getString("leads", "[15]")) } catch (e: Exception) { JSONArray("[15]") }
        return (0 until arr.length()).map { arr.optInt(it) }.filter { it > 0 }.ifEmpty { listOf(15) }
    }

    /** One alarm per race and reminder time; earlier alarms are replaced. */
    fun scheduleReminders(c: Context) {
        val am = c.getSystemService(AlarmManager::class.java)
        val p = prefs(c)
        val old = p.getInt("alarms", 0)
        for (i in 0 until old) {
            PendingIntent.getBroadcast(c, i, Intent(c, ReminderReceiver::class.java), PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE)
                ?.let { am.cancel(it); it.cancel() }
        }
        val now = System.currentTimeMillis()
        val es = spanish(c)
        var n = 0
        for (r in load(c)) for (lead in leads(c)) {
            val at = r.start - lead * 60_000L
            if (at <= now || n >= 60) continue
            val text = (if (es) "Empieza en $lead min" else "Starts in $lead min") + if (r.detail.isNotBlank()) " · ${r.detail}" else ""
            val intent = Intent(c, ReminderReceiver::class.java).putExtra("title", r.title).putExtra("text", text).putExtra("id", n)
            val pi = PendingIntent.getBroadcast(c, n, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
            } else {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
            }
            n++
        }
        p.edit().putInt("alarms", n).apply()
    }
}
