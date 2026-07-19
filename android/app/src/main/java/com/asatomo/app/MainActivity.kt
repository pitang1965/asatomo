package com.asatomo.app

import android.Manifest
import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.work.WorkInfo
import androidx.work.WorkManager
import com.asatomo.app.ui.theme.AsatomoTheme
import java.util.Calendar
import java.util.UUID
import kotlinx.coroutines.launch

/**
 * メイン画面。
 *   - 生存シグナルの手動送信（ごはん / おやすみ / いってきます / ただいま）
 *   - 毎日アラームの設定（AlarmScheduler → AlarmReceiver → AlarmActivity）
 *   - アプリ起動の自動シグナル（透明性の原則: 画面に明示する。CONTEXT.md 生存シグナル）
 *   - 接続設定（開発Bearer。Better Auth ログインは後続で置き換える）
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 未ログイン（開発Bearerも未設定）なら初回フローへ。
        // EXTRA_DEV_SETUP はオンボーディングの「開発用設定を使う」からの跳ね返り抑止。
        val settings = Settings(this)
        if (!settings.isConfigured && !intent.getBooleanExtra(EXTRA_DEV_SETUP, false)) {
            startActivity(Intent(this, OnboardingActivity::class.java))
            finish()
            return
        }

        // API 33+ は通知に実行時許可が要る（アラーム通知のため起動時に要求）。
        if (Build.VERSION.SDK_INT >= 33) {
            registerForActivityResult(ActivityResultContracts.RequestPermission()) {}
                .launch(Manifest.permission.POST_NOTIFICATIONS)
        }

        // アプリを開いたこと自体が生存シグナル（自動 app_open）。連続起動は15分スロットル。
        val now = System.currentTimeMillis()
        if (now - settings.lastAppOpenSentAtMs > APP_OPEN_THROTTLE_MS) {
            settings.lastAppOpenSentAtMs = now
            SignalQueue.enqueue(this, ApiClient.SignalKind.APP_OPEN)
        }

        setContent {
            AsatomoTheme {
                Surface(modifier = Modifier.fillMaxSize()) { MainScreen() }
            }
        }
    }

    companion object {
        const val APP_OPEN_THROTTLE_MS = 15 * 60_000L
        const val EXTRA_DEV_SETUP = "devSetup"
    }
}

@Composable
private fun MainScreen() {
    val context = LocalContext.current
    val settings = remember { Settings(context) }
    val scope = rememberCoroutineScope()

    // 旅行モード（サーバーが真実源。ここは端末側キャッシュのミラーで表示用）。
    var travelUntilMs by remember { mutableStateOf(settings.travelUntilMs) }
    var travelBusy by remember { mutableStateOf(false) }
    var travelMsg by remember { mutableStateOf("") }

    var baseUrl by remember { mutableStateOf(settings.baseUrl) }
    var devSecret by remember { mutableStateOf(settings.devSecret) }
    var userId by remember { mutableStateOf(settings.userId) }
    var status by remember { mutableStateOf("") }
    var trackedWork by remember { mutableStateOf<UUID?>(null) }
    var trackedLabel by remember { mutableStateOf("") }
    var alarmText by
        remember {
            mutableStateOf(
                if (settings.hasAlarm) {
                    "毎日 %02d:%02d に鳴ります".format(settings.alarmHour, settings.alarmMinute)
                } else {
                    ""
                },
            )
        }

    // キューに積んだシグナルの送信状態を観測して表示（圏外→接続時の自動送達も見える）。
    LaunchedEffect(trackedWork) {
        val id = trackedWork ?: return@LaunchedEffect
        WorkManager.getInstance(context).getWorkInfoByIdFlow(id).collect { info ->
            status =
                when (info?.state) {
                    WorkInfo.State.ENQUEUED -> "$trackedLabel: 送信待ち（接続したら届きます）"
                    WorkInfo.State.RUNNING -> "$trackedLabel: 送信中…"
                    WorkInfo.State.SUCCEEDED -> "✓ $trackedLabel が届きました"
                    WorkInfo.State.FAILED -> "✗ $trackedLabel を受け付けられませんでした"
                    else -> status
                }
        }
    }

    fun saveSettings() {
        settings.baseUrl = baseUrl.trim()
        settings.devSecret = devSecret.trim()
        settings.userId = userId.trim()
    }

    fun send(kind: ApiClient.SignalKind, label: String) {
        saveSettings()
        trackedLabel = label
        trackedWork = SignalQueue.enqueue(context, kind)
    }

    fun formatMd(ms: Long): String {
        val c = Calendar.getInstance().apply { timeInMillis = ms }
        return "${c.get(Calendar.MONTH) + 1}/${c.get(Calendar.DAY_OF_MONTH)}"
    }

    fun enterTravel() {
        saveSettings()
        // 初期表示・最小は「明日」、上限はサーバーの travelMaxDays（30日）に合わせる。
        val tomorrow = Calendar.getInstance().apply { add(Calendar.DAY_OF_MONTH, 1) }
        val dlg =
            DatePickerDialog(
                context,
                { _, y, m, d ->
                    // 復帰日の終わり（23:59）まで留守扱い。この時刻を過ぎたら見守り自動再開。
                    val until =
                        Calendar.getInstance().apply {
                            set(y, m, d, 23, 59, 59)
                            set(Calendar.MILLISECOND, 0)
                        }.timeInMillis
                    travelBusy = true
                    travelMsg = ""
                    scope.launch {
                        ApiClient.setTravel(settings, until)
                            .fold(
                                onSuccess = {
                                    settings.travelUntilMs = until
                                    travelUntilMs = until
                                    travelMsg = "旅行モードにしました（${formatMd(until)} まで）"
                                },
                                onFailure = {
                                    travelMsg = "設定できませんでした。期間が長すぎないか確認してください。"
                                },
                            )
                        travelBusy = false
                    }
                },
                tomorrow.get(Calendar.YEAR),
                tomorrow.get(Calendar.MONTH),
                tomorrow.get(Calendar.DAY_OF_MONTH),
            )
        val dayMs = 24L * 60 * 60 * 1000
        dlg.datePicker.minDate = System.currentTimeMillis() + dayMs
        // 29日後まで。選択日の 23:59 でも常にサーバー上限（now + 30日）内に収まる（弾かれ防止）。
        dlg.datePicker.maxDate = System.currentTimeMillis() + 29 * dayMs
        dlg.show()
    }

    fun exitTravel() {
        travelBusy = true
        travelMsg = ""
        scope.launch {
            ApiClient.clearTravel(settings)
                .fold(
                    onSuccess = {
                        settings.travelUntilMs = 0L
                        travelUntilMs = 0L
                        travelMsg = "旅行モードを解除しました。見守りを再開します。"
                    },
                    onFailure = { travelMsg = "解除できませんでした。時間をおいてお試しください。" },
                )
            travelBusy = false
        }
    }

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Spacer(Modifier.size(16.dp))
        Text("アサトモ", style = MaterialTheme.typography.headlineSmall)
        if (settings.userName.isNotEmpty()) {
            Text(
                "${settings.userName} さんとしてログイン中",
                style = MaterialTheme.typography.bodySmall,
            )
        }

        Text("アラーム", style = MaterialTheme.typography.titleMedium)
        Text(
            "セットした時刻に毎日鳴ります。止めるだけで、見守ってくれる人に今日の「元気」が伝わります。",
            style = MaterialTheme.typography.bodySmall,
        )
        Button(
            onClick = {
                val now = Calendar.getInstance()
                TimePickerDialog(
                    context,
                    { _, h, m ->
                        saveSettings()
                        alarmText = AlarmScheduler.setDailyAlarm(context, h, m)
                    },
                    if (settings.hasAlarm) settings.alarmHour else now.get(Calendar.HOUR_OF_DAY),
                    if (settings.hasAlarm) settings.alarmMinute else now.get(Calendar.MINUTE),
                    true,
                ).show()
            },
        ) {
            Text(if (settings.hasAlarm) "アラーム時刻を変える" else "アラームをセット")
        }
        if (alarmText.isNotEmpty()) {
            Text(alarmText, style = MaterialTheme.typography.bodyMedium)
        }

        Spacer(Modifier.size(4.dp))
        Text("いまの様子を伝える", style = MaterialTheme.typography.titleMedium)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { send(ApiClient.SignalKind.MEAL, "ごはん") }) {
                Text("ごはん")
            }
            OutlinedButton(onClick = { send(ApiClient.SignalKind.SLEEP, "おやすみ") }) {
                Text("おやすみ")
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { send(ApiClient.SignalKind.OUTING, "いってきます") }) {
                Text("いってきます")
            }
            OutlinedButton(onClick = { send(ApiClient.SignalKind.HOMECOMING, "ただいま") }) {
                Text("ただいま")
            }
        }
        // 透明性の原則: 自動記録を隠さない（CONTEXT.md 生存シグナル）。
        Text(
            "このアプリを開いたことも「元気」として自動で伝わります。",
            style = MaterialTheme.typography.bodySmall,
        )

        if (status.isNotEmpty()) {
            Spacer(Modifier.size(4.dp))
            Text(status, style = MaterialTheme.typography.bodyMedium)
        }

        Spacer(Modifier.size(12.dp))
        Text("旅行モード", style = MaterialTheme.typography.titleMedium)
        val travelActive = travelUntilMs > System.currentTimeMillis()
        if (travelActive) {
            Text(
                "見守りをお休み中です（${formatMd(travelUntilMs)} まで）。期限が来たら自動で再開します。見守ってくれる人にも「旅行中」と伝わっています。",
                style = MaterialTheme.typography.bodySmall,
            )
            OutlinedButton(onClick = { exitTravel() }, enabled = !travelBusy) {
                Text("旅行モードを解除する")
            }
        } else {
            Text(
                "留守や生活リズムの変化で誤って通知が飛ばないよう、見守りを一時お休みします。期限が来たら自動で再開します（最長30日）。",
                style = MaterialTheme.typography.bodySmall,
            )
            Button(onClick = { enterTravel() }, enabled = !travelBusy) {
                Text("旅行モードにする")
            }
        }
        if (travelMsg.isNotEmpty()) {
            Text(travelMsg, style = MaterialTheme.typography.bodyMedium)
        }

        Spacer(Modifier.size(12.dp))
        Text("接続設定（開発用）", style = MaterialTheme.typography.titleMedium)
        OutlinedTextField(
            value = baseUrl,
            onValueChange = { baseUrl = it },
            label = { Text("サーバーURL") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )
        OutlinedTextField(
            value = devSecret,
            onValueChange = { devSecret = it },
            label = { Text("開発シークレット（DEV_BEARER_SECRET）") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )
        OutlinedTextField(
            value = userId,
            onValueChange = { userId = it },
            label = { Text("ユーザーID（この本人として振る舞う）") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )
        OutlinedButton(onClick = { saveSettings() }) { Text("接続設定を保存") }
    }
}
