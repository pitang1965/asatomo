package com.asatomo.app

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings as AndroidSettings
import java.util.Calendar

/**
 * 毎日1本のアラームのスケジューリング。
 * AlarmManager.setAlarmClock は単発なので、発火のたび（AlarmReceiver）と
 * 再起動・時刻変更のたび（BootReceiver）に scheduleNext で翌回を張り直す。
 */
object AlarmScheduler {

    /** 表示用の時刻ラベル。例: "09:30（午前）" / "17:00（午後）" */
    fun label(hour: Int, minute: Int): String {
        val period = if (hour < 12) "午前" else "午後"
        return "%02d:%02d（%s）".format(hour, minute, period)
    }

    /** 時刻を保存して次回分をセットする（UI から呼ぶ）。戻り値は表示用メッセージ。 */
    fun setDailyAlarm(context: Context, hour: Int, minute: Int): String {
        val settings = Settings(context)
        settings.alarmHour = hour
        settings.alarmMinute = minute
        return if (scheduleNext(context)) {
            label(hour, minute)
        } else {
            "正確なアラームの許可が必要です（設定画面を開きました）"
        }
    }

    /**
     * 保存済みの時刻で次の発火をセットする。未設定なら何もしない。
     * 発火済み時刻は自動的に翌日へ送られる。
     */
    fun scheduleNext(context: Context): Boolean {
        val settings = Settings(context)
        if (!settings.hasAlarm) return false

        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) {
            // USE_EXACT_ALARM 宣言済みなら通常ここへ来ないが、来たら設定画面へ誘導。
            context.startActivity(
                Intent(AndroidSettings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
            return false
        }

        val fire =
            PendingIntent.getBroadcast(
                context,
                1,
                Intent(context, AlarmReceiver::class.java),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
        val show =
            PendingIntent.getActivity(
                context,
                2,
                Intent(context, MainActivity::class.java),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
        val at = nextOccurrence(settings.alarmHour, settings.alarmMinute)
        am.setAlarmClock(AlarmManager.AlarmClockInfo(at.timeInMillis, show), fire)
        return true
    }

    /**
     * セット済みアラームを解除する（ログアウト時。保存済み時刻の削除は Settings.clearForLogout）。
     * シグナルを送れない目覚ましは「見守りが生きている」錯覚を本人に与えるため鳴らさない。
     */
    fun cancel(context: Context) {
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        am.cancel(
            PendingIntent.getBroadcast(
                context,
                1,
                Intent(context, AlarmReceiver::class.java),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            ),
        )
    }

    /** 次の hour:minute の発生時刻（過ぎていれば明日）。 */
    private fun nextOccurrence(hour: Int, minute: Int): Calendar =
        Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, hour)
            set(Calendar.MINUTE, minute)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
            if (timeInMillis <= System.currentTimeMillis()) add(Calendar.DAY_OF_YEAR, 1)
        }
}
