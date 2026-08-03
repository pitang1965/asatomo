package com.asatomo.app

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity

/**
 * ネイティブ LINE ログインの復帰口。
 *
 * Custom Tab で Web の LINE OAuth を完了すると、サーバの /native/handoff が
 *   asatomo://auth?token=...&name=...&email=...
 * へ 302 リダイレクトし、そのカスタムスキームでこの Activity が起動される。
 * ここで bearer セッションを Settings に保存し、初回フロー（橋渡し → アラーム）へ合流する。
 *
 * Google（AuthClient.signInWithGoogle）と同じく、ログイン成功自体を生存シグナルとして
 * app_open を送る（サーバの「ログアウト中」表示を即クリア）。
 */
class AuthCallbackActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        handle(intent)
    }

    // singleTask のため、既存インスタンスへの再来はこちらで受ける。
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handle(intent)
    }

    private fun handle(intent: Intent?) {
        val data = intent?.data
        val token = data?.getQueryParameter("token")
        val settings = Settings(this)

        if (token.isNullOrEmpty()) {
            // OAuth 失敗・メール未取得など。ログイン画面へ戻して再試行できるようにする。
            Toast.makeText(this, "LINEログインに失敗しました。もう一度お試しください。", Toast.LENGTH_LONG)
                .show()
            startActivity(
                Intent(this, OnboardingActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK),
            )
            finish()
            return
        }

        settings.sessionToken = token
        settings.userName = data.getQueryParameter("name") ?: ""
        settings.userEmail = data.getQueryParameter("email") ?: ""

        // ログイン成功＝アプリ利用の生存証拠。スロットルも更新して MainActivity 到達時の二重送信を防ぐ。
        settings.lastAppOpenSentAtMs = System.currentTimeMillis()
        SignalQueue.enqueue(this, ApiClient.SignalKind.APP_OPEN)

        // 初回フローへ合流（sessionToken 設定済みなので OnboardingActivity は橋渡しから始まる）。
        startActivity(
            Intent(this, OnboardingActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK),
        )
        finish()
    }
}
