package com.asatomo.app

import android.content.Context

/**
 * ログイン状態と毎日アラームの永続化（SharedPreferences）。
 * サーバーURLはビルド種別で固定（BuildConfig.BASE_URL。debug=adb reverse 経由の
 * 127.0.0.1:5173 / release=本番Workers）。実行時の接続設定は持たない。
 */
class Settings(context: Context) {
    private val prefs = context.getSharedPreferences("asatomo", Context.MODE_PRIVATE)

    /** Better Auth のセッショントークン（Googleログイン後に保存。空 = 未ログイン）。 */
    var sessionToken: String
        get() = prefs.getString("sessionToken", "") ?: ""
        set(v) = prefs.edit().putString("sessionToken", v).apply()

    /** 表示用のユーザー名（ログイン応答から）。 */
    var userName: String
        get() = prefs.getString("userName", "") ?: ""
        set(v) = prefs.edit().putString("userName", v).apply()

    /** シグナルを送れる状態か（ログイン済みか）。 */
    val isConfigured: Boolean
        get() = sessionToken.isNotEmpty()

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

    /**
     * ログアウト時の端末状態クリア。アラーム時刻も消す
     * （グリル決定: シグナルを送れない目覚ましは「見守りが生きている」錯覚を与えるため）。
     */
    fun clearForLogout() {
        prefs.edit()
            .remove("sessionToken")
            .remove("userName")
            .remove("alarmHour")
            .remove("alarmMinute")
            .remove("lastAppOpenSentAtMs")
            .remove("travelUntilMs")
            .apply()
    }
}
