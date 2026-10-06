package com.pitlanehq.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.SystemClock
import android.view.View
import android.widget.RemoteViews
import java.text.DateFormat
import java.util.Date

/** Home-screen widget with the next planned races and a live countdown. */
class RacesWidget : AppWidgetProvider() {
    override fun onUpdate(c: Context, mgr: AppWidgetManager, ids: IntArray) {
        ids.forEach { mgr.updateAppWidget(it, build(c)) }
    }

    companion object {
        private val rowTitle = intArrayOf(R.id.r1Title, R.id.r2Title, R.id.r3Title)
        private val rowTime = intArrayOf(R.id.r1Time, R.id.r2Time, R.id.r3Time)
        private val rowBox = intArrayOf(R.id.r1, R.id.r2, R.id.r3)

        fun refreshAll(c: Context) {
            val mgr = AppWidgetManager.getInstance(c)
            val ids = mgr.getAppWidgetIds(ComponentName(c, RacesWidget::class.java))
            if (ids.isNotEmpty()) ids.forEach { mgr.updateAppWidget(it, build(c)) }
        }

        fun build(c: Context): RemoteViews {
            val v = RemoteViews(c.packageName, R.layout.widget_races)
            val now = System.currentTimeMillis()
            val races = Races.load(c).filter { it.end > now }.take(3)
            val es = Races.spanish(c)
            v.setTextViewText(R.id.header, if (es) "PRÓXIMAS CARRERAS" else "NEXT RACES")
            v.setViewVisibility(R.id.empty, if (races.isEmpty()) View.VISIBLE else View.GONE)
            v.setTextViewText(R.id.empty, if (es) "Nada planificado. Añade carreras en el Calendario." else "No races planned. Add them in the Calendar.")
            val tf = DateFormat.getTimeInstance(DateFormat.SHORT)
            val df = DateFormat.getDateInstance(DateFormat.SHORT)
            for (i in 0 until 3) {
                val r = races.getOrNull(i)
                v.setViewVisibility(rowBox[i], if (r == null) View.GONE else View.VISIBLE)
                if (r == null) continue
                v.setTextViewText(rowTitle[i], r.title)
                val sameDay = df.format(Date(r.start)) == df.format(Date(now))
                v.setTextViewText(rowTime[i], (if (sameDay) "" else df.format(Date(r.start)) + " ") + tf.format(Date(r.start)))
            }
            val first = races.firstOrNull()
            if (first != null && first.start > now) {
                v.setViewVisibility(R.id.countdown, View.VISIBLE)
                v.setChronometer(R.id.countdown, SystemClock.elapsedRealtime() + (first.start - now), null, true)
                v.setChronometerCountDown(R.id.countdown, true)
            } else {
                v.setViewVisibility(R.id.countdown, View.GONE)
            }
            val open = PendingIntent.getActivity(c, 0, Intent(c, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
            v.setOnClickPendingIntent(R.id.root, open)
            return v
        }
    }
}
