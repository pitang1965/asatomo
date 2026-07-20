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
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.asatomo.app.ui.theme.AsatomoTheme

/**
 * アラーム停止画面。「起きました」＝ alarm_dismiss シグナル送信（本アプリの核となる一手）。
 * ロック画面の上にも表示する（アラーム停止は開錠より先に行いたい）。
 * 停止は即時、送信は SignalQueue（WorkManager）に任せる — ネットワーク不調で鳴りやまない・
 * 送信失敗でシグナルが失われる、の両方をこれで消す。
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

        setContent {
            AsatomoTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    AlarmScreen(finish = { finish() })
                }
            }
        }
    }
}

@Composable
private fun AlarmScreen(finish: () -> Unit) {
    val context = LocalContext.current
    // 見守り者ゼロなら受け手を匂わせない（オフライン・ロック画面上のためキャッシュを読む）。
    val hasWatchers = remember { Settings(context).hasWatchers }

    Column(
        modifier = Modifier.fillMaxSize().padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("おはようございます 🌅", style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.size(12.dp))
        Text(
            if (hasWatchers) {
                "止めると、見守ってくれる人に\n今日の「元気」が伝わります"
            } else {
                "見守り合う友ができると、\n朝の「元気」がここから届くようになります"
            },
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.size(32.dp))
        Button(
            onClick = {
                // 押した瞬間に止める。届ける方はキューが保証する（圏外でも後で届く）。
                SignalQueue.enqueue(context, ApiClient.SignalKind.ALARM_DISMISS)
                finish()
            },
        ) {
            Text("起きました", style = MaterialTheme.typography.titleLarge)
        }
    }
}
