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
        get() = prefs.getString("baseUrl", DEFAULT_BASE_URL) ?: ""
        set(v) = prefs.edit().putString("baseUrl", v).apply()

    companion object {
        /** 既定は本番（Workers）。開発時はメイン画面の接続設定で localhost:5173 に切り替える。 */
        const val DEFAULT_BASE_URL = "https://asatomo.pitang1965.workers.dev"
    }

    var devSecret: String
        get() = prefs.getString("devSecret", "") ?: ""
        set(v) = prefs.edit().putString("devSecret", v).apply()

    var userId: String
        get() = prefs.getString("userId", "seed-subject-sato") ?: ""
        set(v) = prefs.edit().putString("userId", v).apply()

    /** Better Auth のセッショントークン（Googleログイン後に保存。空 = 未ログイン）。 */
    var sessionToken: String
        get() = prefs.getString("sessionToken", "") ?: ""
        set(v) = prefs.edit().putString("sessionToken", v).apply()

    /** 表示用のユーザー名（ログイン応答から）。 */
    var userName: String
        get() = prefs.getString("userName", "") ?: ""
        set(v) = prefs.edit().putString("userName", v).apply()

    /** シグナルを送れる状態か（本ログイン済み、または開発Bearer設定済み）。 */
    val isConfigured: Boolean
        get() = sessionToken.isNotEmpty() || devSecret.isNotEmpty()

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

    /**
     * 旅行モードの期限（epoch ms、0 = 未設定）。サーバー（subjectSettings.travelUntil）が
     * 監視抑制・自動復帰の真実源。ここは直近に本人が設定した値の端末側キャッシュで、表示用。
     * 期限を過ぎたら自動で見守り再開なので、now を超えたら「旅行モードではない」と扱う。
     */
    var travelUntilMs: Long
        get() = prefs.getLong("travelUntilMs", 0L)
        set(v) = prefs.edit().putLong("travelUntilMs", v).apply()

    /** 端末時計基準で現在も旅行モードが有効か（期限切れは自動復帰扱い）。 */
    val isTravelActive: Boolean
        get() = travelUntilMs > System.currentTimeMillis()
}
