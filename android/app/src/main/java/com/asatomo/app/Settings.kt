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

    /** 表示用のメールアドレス（ログイン応答から）。設定画面でどのアカウントか一目で分かるように。 */
    var userEmail: String
        get() = prefs.getString("userEmail", "") ?: ""
        set(v) = prefs.edit().putString("userEmail", v).apply()

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
     * 承諾済みの見守り者が1人以上いるか（サーバーの youAreWatched のキャッシュ）。
     * 「元気が伝わります」等のコピー分岐に使う。見守り者ゼロの初回に受け手を匂わせないよう
     * 既定は false（安全側）。overview 読み込み時とシグナル送信成功時に最新化する。
     */
    var hasWatchers: Boolean
        get() = prefs.getBoolean("hasWatchers", false)
        set(v) = prefs.edit().putBoolean("hasWatchers", v).apply()

    /**
     * ログアウト時の端末状態クリア。アラーム時刻も消す
     * （グリル決定: シグナルを送れない目覚ましは「見守りが生きている」錯覚を与えるため）。
     */
    fun clearForLogout() {
        prefs.edit()
            .remove("sessionToken")
            .remove("userName")
            .remove("userEmail")
            .remove("alarmHour")
            .remove("alarmMinute")
            .remove("lastAppOpenSentAtMs")
            .remove("travelUntilMs")
            .remove("hasWatchers")
            .apply()
    }
}
