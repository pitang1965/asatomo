package com.asatomo.app

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * ログイン状態と毎日アラームの永続化（SharedPreferences）。
 * このファイル（asatomo.xml）はバックアップ・端末間移行の対象外（res/xml/data_extraction_rules.xml）。
 * サーバーURLはビルド種別で固定（BuildConfig.BASE_URL。debug=adb reverse 経由の
 * 127.0.0.1:5173 / release=本番Workers）。実行時の接続設定は持たない。
 */
class Settings(context: Context) {
    private val prefs = context.getSharedPreferences("asatomo", Context.MODE_PRIVATE)

    /**
     * Better Auth のセッショントークン（ログイン後に保存。空 = 未ログイン）。
     * Android Keystore の鍵（端末から取り出せない）で暗号化して保存する。復号できない
     * （鍵が無い端末へ復元された等）ときは未ログイン扱い。
     */
    var sessionToken: String
        get() {
            cachedToken?.let { return it }
            // 旧版が平文で保存したトークンを暗号化へ移す（更新で既存ユーザーをログアウトさせない）。
            prefs.getString(LEGACY_TOKEN, null)?.let {
                sessionToken = it
                return it
            }
            val token =
                prefs.getString(ENC_TOKEN, null)
                    ?.let { runCatching { decrypt(it) }.getOrNull() } ?: ""
            cachedToken = token
            return token
        }
        set(v) {
            cachedToken = v
            val enc = runCatching { encrypt(v) }.getOrNull()
            prefs.edit()
                .apply {
                    if (enc != null) {
                        putString(ENC_TOKEN, enc).remove(LEGACY_TOKEN)
                    } else {
                        // shortcut: Keystore が壊れた端末では平文で保存する（ログイン不能＝見守り停止の
                        // 方が害が大きい。アプリ専用領域＋バックアップ対象外）。実機で発生報告が出たら見直す。
                        putString(LEGACY_TOKEN, v).remove(ENC_TOKEN)
                    }
                }
                .apply()
        }

    /** LINE ログイン中だけ持つ PKCE verifier（AuthClient.startLineLogin → finishLineLogin）。 */
    var lineVerifier: String
        get() = prefs.getString("lineVerifier", "") ?: ""
        set(v) = prefs.edit().putString("lineVerifier", v).apply()

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

    /** 早起きして当日分を鳴らさない日に、ローカル日付（YYYY-MM-DD）を保存する。 */
    var skippedAlarmDate: String?
        get() = prefs.getString("skippedAlarmDate", null)
        set(v) = prefs.edit().putString("skippedAlarmDate", v).apply()

    /** 早起きスキップ後、翌日の再予約に失敗しているか。 */
    var skippedAlarmRescheduleFailed: Boolean
        get() = prefs.getBoolean("skippedAlarmRescheduleFailed", false)
        set(v) = prefs.edit().putBoolean("skippedAlarmRescheduleFailed", v).apply()

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
        cachedToken = ""
        prefs.edit()
            .remove(LEGACY_TOKEN)
            .remove(ENC_TOKEN)
            .remove("lineVerifier")
            .remove("userName")
            .remove("userEmail")
            .remove("alarmHour")
            .remove("alarmMinute")
            .remove("skippedAlarmDate")
            .remove("skippedAlarmRescheduleFailed")
            .remove("lastAppOpenSentAtMs")
            .remove("travelUntilMs")
            .remove("hasWatchers")
            .apply()
    }

    private companion object {
        const val LEGACY_TOKEN = "sessionToken"
        const val ENC_TOKEN = "sessionTokenEnc"
        const val KEY_ALIAS = "asatomo_session"
        const val IV_BYTES = 12

        /** Keystore 復号を API 呼び出しや画面描画のたびに繰り返さないためのプロセス内キャッシュ。 */
        @Volatile var cachedToken: String? = null

        fun key(): SecretKey {
            val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            (ks.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
            return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
                .apply {
                    init(
                        KeyGenParameterSpec.Builder(
                            KEY_ALIAS,
                            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                        )
                            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                            .build(),
                    )
                }
                .generateKey()
        }

        /** AES-GCM。出力は base64(IV 12バイト ‖ 暗号文＋タグ)。IV は Keystore が毎回ランダム生成。 */
        fun encrypt(plain: String): String {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, key())
            return Base64.encodeToString(
                cipher.iv + cipher.doFinal(plain.toByteArray()),
                Base64.NO_WRAP,
            )
        }

        fun decrypt(encoded: String): String {
            val bytes = Base64.decode(encoded, Base64.NO_WRAP)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes, 0, IV_BYTES))
            return String(cipher.doFinal(bytes, IV_BYTES, bytes.size - IV_BYTES))
        }
    }
}
