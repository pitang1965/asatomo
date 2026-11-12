package com.asatomo.app

import android.app.Activity
import android.util.Base64
import java.security.MessageDigest
import java.security.SecureRandom
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

/**
 * ログイン（Google / LINE）。
 *   Google: Credential Manager で Google ID トークンを取得し、Better Auth の
 *   /api/auth/sign-in/social（idToken）へ渡してセッションを確立する。
 *   LINE: Custom Tab の Web OAuth 完了後に届く使い捨てコードを /native/handoff で交換する。
 *   セッショントークンは bearer プラグインの set-auth-token ヘッダ（または応答 body）から
 *   取り出して Settings に保存し、以後の API 呼び出しの Authorization に使う。
 */
object AuthClient {

    /** Google ログインを実行し、成功したらセッションを保存して表示名を返す。 */
    suspend fun signInWithGoogle(activity: Activity, settings: Settings): Result<String> {
        val idToken =
            try {
                requestGoogleIdToken(activity)
            } catch (e: Exception) {
                return Result.failure(e)
            }
        return withContext(Dispatchers.IO) {
            runCatching { exchangeForSession(settings, idToken) }
        }
    }

    private suspend fun requestGoogleIdToken(activity: Activity): String {
        val option =
            GetGoogleIdOption.Builder()
                .setServerClientId(BuildConfig.GOOGLE_WEB_CLIENT_ID)
                // 初回ログインも許す（承認済みアカウント限定にしない）。
                .setFilterByAuthorizedAccounts(false)
                .build()
        val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
        val credential = CredentialManager.create(activity).getCredential(activity, request).credential
        if (
            credential is CustomCredential &&
            credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
        ) {
            return GoogleIdTokenCredential.createFrom(credential.data).idToken
        }
        error("Google ID トークンを取得できませんでした（type=${credential.type}）")
    }

    /**
     * LINE ログイン開始。PKCE verifier を作って端末に保存し、Custom Tab で開く URL を返す。
     * URL に載るのは verifier のハッシュ（challenge）だけ。verifier 本体はこのアプリから出ない。
     */
    fun startLineLogin(settings: Settings): String {
        val flags = Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP
        val verifier =
            Base64.encodeToString(ByteArray(32).also { SecureRandom().nextBytes(it) }, flags)
        settings.lineVerifier = verifier
        val challenge =
            Base64.encodeToString(
                MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray()),
                flags,
            )
        return "${BuildConfig.AUTH_ORIGIN}/native/line?c=$challenge"
    }

    /**
     * LINE ログイン完了。asatomo://auth で受けた使い捨てコードを、保存済み verifier と一緒に
     * サーバーへ渡してセッションに交換する。verifier が無い（このアプリが始めたログインではない）
     * コードは使わない＝他人が作ったリンクを踏まされても、その人のアカウントにログインしない。
     */
    suspend fun finishLineLogin(settings: Settings, code: String): Result<String> =
        withContext(Dispatchers.IO) {
            runCatching {
                val verifier = settings.lineVerifier
                settings.lineVerifier = ""
                check(verifier.isNotEmpty()) { "このアプリが開始した LINE ログインではありません" }
                // OAuth は AUTH_ORIGIN、API は BASE_URL（debug では別オリジンだが同じサーバー）。
                exchangeForSession(
                    settings,
                    "/native/handoff",
                    JSONObject().put("code", code).put("verifier", verifier),
                )
            }
        }

    private fun exchangeForSession(settings: Settings, idToken: String): String =
        exchangeForSession(
            settings,
            "/api/auth/sign-in/social",
            JSONObject()
                .put("provider", "google")
                .put("idToken", JSONObject().put("token", idToken)),
        )

    /** JSON を POST し、応答の token / user を Settings に保存して表示名を返す。 */
    private fun exchangeForSession(settings: Settings, path: String, body: JSONObject): String {
        val url = URL("${BuildConfig.BASE_URL.trimEnd('/')}$path")
        val conn = url.openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.connectTimeout = 10000
            conn.readTimeout = 15000
            conn.doOutput = true
            conn.setRequestProperty("content-type", "application/json")
            conn.setRequestProperty("connection", "close")
            conn.outputStream.use { it.write(body.toString().toByteArray()) }

            val code = conn.responseCode
            val text =
                (if (code in 200..299) conn.inputStream else conn.errorStream)
                    ?.bufferedReader()?.use { it.readText() } ?: ""
            if (code !in 200..299) error("ログイン失敗 HTTP $code: $text")

            val json = JSONObject(text)
            // bearer プラグインのヘッダを優先、無ければ応答 body の token。
            val token =
                conn.getHeaderField("set-auth-token")
                    ?: json.optString("token").takeIf { it.isNotEmpty() }
                    ?: error("セッショントークンが応答にありません")
            settings.sessionToken = token
            val user = json.optJSONObject("user")
            val name = user?.optString("name") ?: ""
            settings.userName = name
            // メールも保存（設定画面でどのアカウントか一目で分かるように。名前だけだと別メールの
            // 別アカウントと見分けにくい）。
            settings.userEmail = user?.optString("email") ?: ""
            return name
        } finally {
            conn.disconnect()
        }
    }
}
