package com.asatomo.app

import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.asatomo.app.ui.theme.AsatomoTheme
import kotlinx.coroutines.launch

/**
 * アラーム停止画面。「起きました」＝ alarm_dismiss シグナル送信（本アプリの核となる一手）。
 * ロック画面の上にも表示する（アラーム停止は開錠より先に行いたい）。
 * 送信失敗時はアラームだけ止める逃げ道を残す（ネットワーク不調で鳴りやまないのは最悪のため）。
 */
class AlarmActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        }
        (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
            .cancel(AlarmReceiver.NOTIFICATION_ID)

        val settings = Settings(this)
        setContent {
            AsatomoTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    AlarmScreen(settings = settings, finish = { finish() })
                }
            }
        }
    }
}

@Composable
private fun AlarmScreen(settings: Settings, finish: () -> Unit) {
    val scope = rememberCoroutineScope()
    var sending by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    Column(
        modifier = Modifier.fillMaxSize().padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("おはようございます 🌅", style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.size(12.dp))
        Text(
            "止めると、見守ってくれる人に\n今日の「元気」が伝わります",
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.size(32.dp))
        Button(
            enabled = !sending,
            onClick = {
                sending = true
                error = null
                scope.launch {
                    ApiClient.postSignal(settings, ApiClient.SignalKind.ALARM_DISMISS)
                        .fold(
                            onSuccess = { finish() },
                            onFailure = {
                                error = it.message ?: "送信失敗"
                                sending = false
                            },
                        )
                }
            },
        ) {
            Text(
                if (sending) "送信中…" else "起きました",
                style = MaterialTheme.typography.titleLarge,
            )
        }
        error?.let {
            Spacer(Modifier.size(16.dp))
            Text(
                "送信できませんでした: $it",
                color = MaterialTheme.colorScheme.error,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.size(8.dp))
            Button(onClick = finish) { Text("あとで（アラームだけ止める）") }
        }
    }
}
