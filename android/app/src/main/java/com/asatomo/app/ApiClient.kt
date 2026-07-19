package com.asatomo.app

import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
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
        OUTING("outing"),
        HOMECOMING("homecoming"),
    }

    /** 再試行しても無駄な失敗（入力不正など4xx）。キューはこれで諦める。 */
    class PermanentFailure(message: String) : Exception(message)

    /** 認証切れ（401）。再ログインすれば直るため再試行しつつ、本人へ通知する（沈黙より通知）。 */
    class AuthFailure(message: String) : Exception(message)

    /**
     * 生存シグナルを送る。occurredAtMs は端末側の発生時刻（キュー再送で遅延しても
     * 「いつの証拠か」をサーバへ正しく伝える。ADR-0001 精緻化）。
     */
    suspend fun postSignal(
        settings: Settings,
        kind: SignalKind,
        occurredAtMs: Long? = null,
    ): Result<String> =
        withContext(Dispatchers.IO) {
            // adb reverse 経由では keep-alive の古い接続が「unexpected end of stream」で
            // 死ぬことがある。接続を使い回さず（Connection: close）、1回だけリトライする。
            var last: Throwable? = null
            repeat(2) {
                runCatching { postOnce(settings, kind, occurredAtMs) }
                    .fold(
                        onSuccess = { return@withContext Result.success(it) },
                        onFailure = {
                            if (it is PermanentFailure || it is AuthFailure) {
                                return@withContext Result.failure(it)
                            }
                            last = it
                        },
                    )
            }
            Result.failure(last ?: IllegalStateException("unreachable"))
        }

    /**
     * 旅行モードを設定する。until は端末側で決めた復帰時刻（この時刻を過ぎたら見守り自動再開）。
     * サーバーが上限日数（既定30日）を強制し、超過は 400 で PermanentFailure。
     */
    suspend fun setTravel(settings: Settings, untilMs: Long): Result<Unit> =
        withContext(Dispatchers.IO) {
            runCatching {
                request(
                    settings,
                    "POST",
                    "/api/travel",
                    JSONObject().put("until", Instant.ofEpochMilli(untilMs).toString()).toString(),
                )
                Unit
            }
        }

    /** 旅行モードを解除して見守りを即再開する。 */
    suspend fun clearTravel(settings: Settings): Result<Unit> =
        withContext(Dispatchers.IO) {
            runCatching {
                request(settings, "DELETE", "/api/travel", null)
                Unit
            }
        }

    private fun postOnce(
        settings: Settings,
        kind: SignalKind,
        occurredAtMs: Long?,
    ): String {
        val body =
            JSONObject()
                .put("kind", kind.wire)
                .apply {
                    if (occurredAtMs != null) {
                        put("occurredAt", Instant.ofEpochMilli(occurredAtMs).toString())
                    }
                }
                .toString()
        return request(settings, "POST", "/api/signals", body)
    }

    /** 本ログイン済みならセッショントークン、なければ開発Bearer（実験用の後方互換）。 */
    private fun authHeader(settings: Settings): String =
        if (settings.sessionToken.isNotEmpty()) {
            "Bearer ${settings.sessionToken}"
        } else {
            "Bearer ${settings.devSecret}:${settings.userId}"
        }

    /** 認証付き JSON リクエストの共通処理。非2xx は失敗種別に写して投げる。body=null は本文なし。 */
    private fun request(
        settings: Settings,
        method: String,
        path: String,
        body: String?,
    ): String {
        val url = URL("${settings.baseUrl.trimEnd('/')}$path")
        val conn = url.openConnection() as HttpURLConnection
        try {
            conn.requestMethod = method
            conn.connectTimeout = 5000
            conn.readTimeout = 10000
            conn.setRequestProperty("connection", "close")
            conn.setRequestProperty("authorization", authHeader(settings))
            if (body != null) {
                conn.doOutput = true
                conn.setRequestProperty("content-type", "application/json")
                conn.outputStream.use { it.write(body.toByteArray()) }
            }

            val code = conn.responseCode
            val text =
                (if (code in 200..299) conn.inputStream else conn.errorStream)
                    ?.bufferedReader()?.use { it.readText() } ?: ""
            if (code in 200..299) return text
            // 401 は「ログインし直せば直る」ため一時失敗扱い（キューが再送し、本人へ通知）。
            if (code == 401) throw AuthFailure("HTTP 401: $text")
            if (code in 400..499 && code != 408 && code != 429) {
                throw PermanentFailure("HTTP $code: $text")
            }
            error("HTTP $code: $text")
        } finally {
            conn.disconnect()
        }
    }
}
