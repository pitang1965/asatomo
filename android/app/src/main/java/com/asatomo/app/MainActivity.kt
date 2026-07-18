package com.asatomo.app

import android.Manifest
import android.app.AlarmManager
import android.app.PendingIntent
import android.app.TimePickerDialog
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.provider.Settings as AndroidSettings
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.asatomo.app.ui.theme.AsatomoTheme
import java.util.Calendar
import kotlinx.coroutines.launch

/**
 * 実験用メイン画面。
 *   - 接続設定（サーバーURL・開発シークレット・ユーザーID）
 *   - 生存シグナルの手動送信（元気です / ご飯 / おやすみ）
 *   - アラームのセット（AlarmManager.setAlarmClock → AlarmReceiver → AlarmActivity）
 * 本番では設定欄は消え、Better Auth ログインと定期アラームに置き換わる。
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // API 33+ は通知に実行時許可が要る（アラーム通知のため起動時に要求）。
        if (Build.VERSION.SDK_INT >= 33) {
            registerForActivityResult(ActivityResultContracts.RequestPermission()) {}
                .launch(Manifest.permission.POST_NOTIFICATIONS)
        }

        setContent {
            AsatomoTheme {
                Surface(modifier = Modifier.fillMaxSize()) { MainScreen() }
            }
        }
    }
}

/** 次の hour:minute の発生時刻（過ぎていれば明日）。 */
private fun nextOccurrence(hour: Int, minute: Int): Calendar =
    Calendar.getInstance().apply {
        set(Calendar.HOUR_OF_DAY, hour)
        set(Calendar.MINUTE, minute)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
        if (timeInMillis <= System.currentTimeMillis()) add(Calendar.DAY_OF_YEAR, 1)
    }

private fun setAlarm(context: Context, hour: Int, minute: Int): String {
    val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) {
        // USE_EXACT_ALARM 宣言済みなら通常ここへ来ないが、来たら設定画面へ誘導。
        context.startActivity(Intent(AndroidSettings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM))
        return "正確なアラームの許可が必要です（設定画面を開きました）"
    }
    val fire =
        PendingIntent.getBroadcast(
            context,
            1,
            Intent(context, AlarmReceiver::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
    val show =
        PendingIntent.getActivity(
            context,
            2,
            Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
    val at = nextOccurrence(hour, minute)
    am.setAlarmClock(AlarmManager.AlarmClockInfo(at.timeInMillis, show), fire)
    return "アラームをセットしました: %02d:%02d".format(hour, minute)
}

@Composable
private fun MainScreen() {
    val context = LocalContext.current
    val settings = remember { Settings(context) }
    val scope = rememberCoroutineScope()

    var baseUrl by remember { mutableStateOf(settings.baseUrl) }
    var devSecret by remember { mutableStateOf(settings.devSecret) }
    var userId by remember { mutableStateOf(settings.userId) }
    var status by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }

    fun saveSettings() {
        settings.baseUrl = baseUrl.trim()
        settings.devSecret = devSecret.trim()
        settings.userId = userId.trim()
    }

    fun send(kind: ApiClient.SignalKind, label: String) {
        saveSettings()
        sending = true
        status = "$label を送信中…"
        scope.launch {
            ApiClient.postSignal(settings, kind)
                .fold(
                    onSuccess = { status = "✓ $label が届きました（$it）" },
                    onFailure = { status = "✗ 送信失敗: ${it.message}" },
                )
            sending = false
        }
    }

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Spacer(Modifier.size(16.dp))
        Text("アサトモ（実験）", style = MaterialTheme.typography.headlineSmall)

        Text("接続設定", style = MaterialTheme.typography.titleMedium)
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

        Spacer(Modifier.size(4.dp))
        Text("生存シグナルを送る", style = MaterialTheme.typography.titleMedium)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                enabled = !sending,
                onClick = { send(ApiClient.SignalKind.APP_OPEN, "元気です") },
            ) {
                Text("元気です")
            }
            OutlinedButton(
                enabled = !sending,
                onClick = { send(ApiClient.SignalKind.MEAL, "ご飯") },
            ) {
                Text("ご飯")
            }
            OutlinedButton(
                enabled = !sending,
                onClick = { send(ApiClient.SignalKind.SLEEP, "おやすみ") },
            ) {
                Text("おやすみ")
            }
        }

        Spacer(Modifier.size(4.dp))
        Text("アラーム", style = MaterialTheme.typography.titleMedium)
        Text(
            "セットした時刻にアラームが鳴り、「起きました」で今日の元気が届きます。",
            style = MaterialTheme.typography.bodySmall,
        )
        Button(
            onClick = {
                val now = Calendar.getInstance()
                TimePickerDialog(
                    context,
                    { _, h, m ->
                        saveSettings()
                        status = setAlarm(context, h, m)
                    },
                    now.get(Calendar.HOUR_OF_DAY),
                    now.get(Calendar.MINUTE),
                    true,
                ).show()
            },
        ) {
            Text("アラームをセット")
        }

        if (status.isNotEmpty()) {
            Spacer(Modifier.size(4.dp))
            Text(status, style = MaterialTheme.typography.bodyMedium)
        }
    }
}
