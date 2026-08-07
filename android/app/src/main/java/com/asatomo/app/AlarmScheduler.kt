package com.asatomo.app

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings as AndroidSettings
import java.util.Calendar
import java.util.Locale

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
        // 時刻を変える操作は新しい次回分を明示しているため、早起きスキップを解除する。
        settings.skippedAlarmDate = null
        settings.skippedAlarmRescheduleFailed = false
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
        val now = Calendar.getInstance()
        val at =
            nextOccurrence(
                settings.alarmHour,
                settings.alarmMinute,
                now,
                settings.skippedAlarmDate == dateKey(now),
            )
        am.setAlarmClock(AlarmManager.AlarmClockInfo(at.timeInMillis, show), fire)
        return true
    }

    /**
     * 早起きした当日分だけを飛ばし、翌日の同時刻を次回にする。
     * 生存シグナルの送信は呼び出し元が SignalQueue で別途行う。
     */
    fun skipToday(context: Context): Boolean {
        val settings = Settings(context)
        if (!canSkipToday(context)) return false

        settings.skippedAlarmDate = dateKey(Calendar.getInstance())
        // 先に当日分を消す。翌日の登録に失敗しても、意図せず今日鳴ることはない。
        cancel(context)
        val scheduled = scheduleNext(context)
        settings.skippedAlarmRescheduleFailed = !scheduled
        return scheduled
    }

    /** 次の設定時刻が今日かつ未来なら、早起きスキップを出せる。 */
    fun canSkipToday(context: Context): Boolean {
        val settings = Settings(context)
        if (!settings.hasAlarm) return false
        return isAlarmDueToday(
            settings.alarmHour,
            settings.alarmMinute,
            settings.skippedAlarmDate,
            Calendar.getInstance(),
        )
    }

    /** 早起きスキップ済みか（表示と復帰時の再描画用）。 */
    fun isAlarmSkippedToday(context: Context): Boolean {
        val now = Calendar.getInstance()
        return Settings(context).skippedAlarmDate == dateKey(now)
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

    /** 次の hour:minute の発生時刻（過ぎている、または当日分を飛ばしたら明日）。 */
    private fun nextOccurrence(
        hour: Int,
        minute: Int,
        now: Calendar,
        skipToday: Boolean,
    ): Calendar =
        (now.clone() as Calendar).apply {
            set(Calendar.HOUR_OF_DAY, hour)
            set(Calendar.MINUTE, minute)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
            if (skipToday || timeInMillis <= now.timeInMillis) add(Calendar.DAY_OF_YEAR, 1)
        }

    internal fun isAlarmDueToday(
        hour: Int,
        minute: Int,
        skippedDate: String?,
        now: Calendar,
    ): Boolean =
        skippedDate != dateKey(now) && scheduledToday(hour, minute, now).timeInMillis > now.timeInMillis

    private fun scheduledToday(hour: Int, minute: Int, now: Calendar): Calendar =
        (now.clone() as Calendar).apply {
            set(Calendar.HOUR_OF_DAY, hour)
            set(Calendar.MINUTE, minute)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }

    private fun dateKey(calendar: Calendar): String =
        String.format(
            Locale.US,
            "%04d-%02d-%02d",
            calendar.get(Calendar.YEAR),
            calendar.get(Calendar.MONTH) + 1,
            calendar.get(Calendar.DAY_OF_MONTH),
        )
}
