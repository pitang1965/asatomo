package com.asatomo.app

import android.app.Activity
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
 * Google ログイン。
 *   Credential Manager で Google ID トークンを取得し、Better Auth の
 *   /api/auth/sign-in/social（idToken）へ渡してセッションを確立する。
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

    private fun exchangeForSession(settings: Settings, idToken: String): String {
        val url = URL("${settings.baseUrl.trimEnd('/')}/api/auth/sign-in/social")
        val conn = url.openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.connectTimeout = 10000
            conn.readTimeout = 15000
            conn.doOutput = true
            conn.setRequestProperty("content-type", "application/json")
            conn.setRequestProperty("connection", "close")
            val body =
                JSONObject()
                    .put("provider", "google")
                    .put("idToken", JSONObject().put("token", idToken))
                    .toString()
            conn.outputStream.use { it.write(body.toByteArray()) }

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
            val name = json.optJSONObject("user")?.optString("name") ?: ""
            settings.userName = name
            return name
        } finally {
            conn.disconnect()
        }
    }
}
