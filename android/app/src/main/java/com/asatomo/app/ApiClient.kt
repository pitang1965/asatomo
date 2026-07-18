package com.asatomo.app

import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

/**
 * アサトモ API の最小クライアント。生存シグナル（POST /api/signals）だけを扱う。
 * 依存を増やさないため HttpURLConnection + org.json。
 */
object ApiClient {

    /** 生存シグナル種別（サーバーの signal_kind enum と一致させること）。 */
    enum class SignalKind(val wire: String) {
        ALARM_DISMISS("alarm_dismiss"),
        MEAL("meal"),
        SLEEP("sleep"),
        APP_OPEN("app_open"),
    }

    suspend fun postSignal(settings: Settings, kind: SignalKind): Result<String> =
        withContext(Dispatchers.IO) {
            // adb reverse 経由では keep-alive の古い接続が「unexpected end of stream」で
            // 死ぬことがある。接続を使い回さず（Connection: close）、1回だけリトライする。
            var last: Throwable? = null
            repeat(2) {
                runCatching { postOnce(settings, kind) }
                    .fold(onSuccess = { return@withContext Result.success(it) }, onFailure = { last = it })
            }
            Result.failure(last ?: IllegalStateException("unreachable"))
        }

    private fun postOnce(settings: Settings, kind: SignalKind): String {
        val url = URL("${settings.baseUrl.trimEnd('/')}/api/signals")
        val conn = url.openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.connectTimeout = 5000
            conn.readTimeout = 10000
            conn.doOutput = true
            conn.setRequestProperty("content-type", "application/json")
            conn.setRequestProperty("connection", "close")
            conn.setRequestProperty(
                "authorization",
                "Bearer ${settings.devSecret}:${settings.userId}",
            )
            val body = JSONObject().put("kind", kind.wire).toString()
            conn.outputStream.use { it.write(body.toByteArray()) }

            val code = conn.responseCode
            val text =
                (if (code in 200..299) conn.inputStream else conn.errorStream)
                    ?.bufferedReader()?.use { it.readText() } ?: ""
            if (code !in 200..299) error("HTTP $code: $text")
            return text
        } finally {
            conn.disconnect()
        }
    }
}
