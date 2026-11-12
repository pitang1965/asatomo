package com.asatomo.app

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch

/**
 * ネイティブ LINE ログインの復帰口。
 *
 * Custom Tab で Web の LINE OAuth を完了すると、サーバの /native/handoff が
 *   asatomo://auth?code=...
 * へ 302 リダイレクトし、そのカスタムスキームでこの Activity が起動される。
 * カスタムスキームは他アプリに横取りされうるので、URL にはトークンも個人情報も載せない。
 * 届くのは使い捨てコードだけで、ログイン開始時に端末へ保存した PKCE verifier と一緒に
 * サーバーへ渡して初めてセッションになる（AuthClient.finishLineLogin）。
 * 交換後は初回フロー（橋渡し → アラーム）へ合流する。
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
        val code = intent?.data?.getQueryParameter("code")
        val settings = Settings(this)

        lifecycleScope.launch {
            // code 無し = OAuth 失敗・メール未取得など。交換失敗と同じ扱いで再試行できるようにする。
            val ok =
                !code.isNullOrEmpty() && AuthClient.finishLineLogin(settings, code).isSuccess
            if (ok) {
                // ログイン成功＝アプリ利用の生存証拠。スロットルも更新して MainActivity 到達時の二重送信を防ぐ。
                settings.lastAppOpenSentAtMs = System.currentTimeMillis()
                SignalQueue.enqueue(this@AuthCallbackActivity, ApiClient.SignalKind.APP_OPEN)
            } else {
                Toast.makeText(
                    this@AuthCallbackActivity,
                    "LINEログインに失敗しました。もう一度お試しください。",
                    Toast.LENGTH_LONG,
                ).show()
            }

            // 初回フローへ合流（成功なら sessionToken 設定済みなので橋渡しから、失敗ならログインから）。
            startActivity(
                Intent(this@AuthCallbackActivity, OnboardingActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK),
            )
            finish()
        }
    }
}
