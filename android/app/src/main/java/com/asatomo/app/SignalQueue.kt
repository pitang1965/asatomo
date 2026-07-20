package com.asatomo.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import java.util.UUID
import java.util.concurrent.TimeUnit

/**
 * 生存シグナルの永続送信キュー（WorkManager）。
 * 発生時刻（occurredAt）をキュー投入時に確定し、圏外・再起動をまたいでも再送する。
 * サーバ側は発生時刻基準で覆しを判定するため（ADR-0001 精緻化）、古い再送分を
 * 「今の生存証拠」と誤解しない。だからクライアントは安心して何日後でも届けてよい。
 */
object SignalQueue {

    /** シグナルをキューに積む。戻り値の ID で WorkInfo（送信状態）を観測できる。 */
    fun enqueue(context: Context, kind: ApiClient.SignalKind): UUID {
        val request =
            OneTimeWorkRequestBuilder<SignalWorker>()
                .setInputData(
                    workDataOf(
                        KEY_KIND to kind.wire,
                        KEY_OCCURRED_AT_MS to System.currentTimeMillis(),
                    ),
                )
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build(),
                )
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
        WorkManager.getInstance(context).enqueue(request)
        return request.id
    }

    const val KEY_KIND = "kind"
    const val KEY_OCCURRED_AT_MS = "occurredAtMs"
}

class SignalWorker(context: Context, params: WorkerParameters) :
    CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val wire = inputData.getString(SignalQueue.KEY_KIND) ?: return Result.failure()
        val kind =
            ApiClient.SignalKind.entries.find { it.wire == wire } ?: return Result.failure()
        val occurredAtMs = inputData.getLong(SignalQueue.KEY_OCCURRED_AT_MS, 0L)
        if (occurredAtMs <= 0L) return Result.failure()

        val settings = Settings(applicationContext)
        return ApiClient.postSignal(settings, kind, occurredAtMs)
            .fold(
                onSuccess = { body ->
                    // コピー分岐フラグを送信のたびに最新化（見守り者取得直後の停滞を次の1本で回復）。
                    ApiClient.parseYouAreWatched(body)?.let { settings.hasWatchers = it }
                    Result.success()
                },
                onFailure = { e ->
                    // 恒久的な拒否（入力不正等）だけ諦める。ネットワーク不調・認証切れは再試行
                    //（認証切れは本人がログインし直せば次の再試行で届く。沈黙より再送）。
                    when (e) {
                        is ApiClient.PermanentFailure -> Result.failure()
                        is ApiClient.AuthFailure -> {
                            // 沈黙より通知: 静かに失敗し続けず、本人に再ログインを促す。
                            notifyReloginNeeded(applicationContext)
                            Result.retry()
                        }
                        else -> Result.retry()
                    }
                },
            )
    }

    private fun notifyReloginNeeded(context: Context) {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(
            NotificationChannel(
                AUTH_CHANNEL_ID,
                "ログイン",
                NotificationManager.IMPORTANCE_HIGH,
            ),
        )
        val open =
            PendingIntent.getActivity(
                context,
                3,
                Intent(context, MainActivity::class.java),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
        nm.notify(
            AUTH_NOTIFICATION_ID,
            NotificationCompat.Builder(context, AUTH_CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_alert)
                .setContentTitle("ログインし直してください")
                .setContentText("「元気」が届かなくなっています。タップしてログインすると、たまった分もまとめて届きます。")
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setContentIntent(open)
                .setAutoCancel(true)
                .build(),
        )
    }

    companion object {
        const val AUTH_CHANNEL_ID = "asatomo_auth"
        const val AUTH_NOTIFICATION_ID = 2
    }
}
