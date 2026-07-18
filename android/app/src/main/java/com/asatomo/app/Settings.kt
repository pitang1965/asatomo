package com.asatomo.app

import android.content.Context

/**
 * 接続設定と毎日アラームの永続化（SharedPreferences）。
 * 開発中は adb reverse tcp:5173 tcp:5173 により端末の localhost:5173 が PC の dev サーバーへ届く。
 * 認証は開発用バイパス（Authorization: Bearer <secret>:<userId>）。Better Auth ログインは後続で置き換える。
 */
class Settings(context: Context) {
    private val prefs = context.getSharedPreferences("asatomo", Context.MODE_PRIVATE)

    var baseUrl: String
        get() = prefs.getString("baseUrl", "http://localhost:5173") ?: ""
        set(v) = prefs.edit().putString("baseUrl", v).apply()

    var devSecret: String
        get() = prefs.getString("devSecret", "") ?: ""
        set(v) = prefs.edit().putString("devSecret", v).apply()

    var userId: String
        get() = prefs.getString("userId", "seed-subject-sato") ?: ""
        set(v) = prefs.edit().putString("userId", v).apply()

    /** 毎日アラームの時刻（-1 = 未設定）。1本のみ（グリル決定: 毎日同一時刻1本）。 */
    var alarmHour: Int
        get() = prefs.getInt("alarmHour", -1)
        set(v) = prefs.edit().putInt("alarmHour", v).apply()

    var alarmMinute: Int
        get() = prefs.getInt("alarmMinute", -1)
        set(v) = prefs.edit().putInt("alarmMinute", v).apply()

    val hasAlarm: Boolean
        get() = alarmHour >= 0 && alarmMinute >= 0

    /** 自動 app_open シグナルの最終送信時刻（連続起動でのスパム防止スロットル用）。 */
    var lastAppOpenSentAtMs: Long
        get() = prefs.getLong("lastAppOpenSentAtMs", 0L)
        set(v) = prefs.edit().putLong("lastAppOpenSentAtMs", v).apply()
}
