package com.asatomo.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * 再起動・時刻/タイムゾーン変更でアラームを張り直す。
 * AlarmManager のアラームは再起動で消えるため、これが無いと「生存確認の要」が沈黙する。
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_TIME_CHANGED,
            Intent.ACTION_TIMEZONE_CHANGED,
            -> AlarmScheduler.scheduleNext(context)
        }
    }
}
