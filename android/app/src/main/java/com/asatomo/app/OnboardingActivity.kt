package com.asatomo.app

import android.app.TimePickerDialog
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.asatomo.app.ui.theme.AsatomoTheme
import java.util.Calendar
import kotlinx.coroutines.launch

/**
 * 初回フロー（グリル決定: ログイン → 橋渡しコピー1枚 → アラーム時刻設定 → メイン）。
 * 橋渡し画面は初見ユーザーに「元気が届く」の意味を伝え、同時に自動記録を明示する
 * （透明性の原則。CONTEXT.md 生存シグナル / メモリ: 初見ユーザーへの用語の伝わりにくさ）。
 */
class OnboardingActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            AsatomoTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    OnboardingFlow(
                        activity = this,
                        done = {
                            startActivity(Intent(this, MainActivity::class.java))
                            finish()
                        },
                    )
                }
            }
        }
    }
}

private enum class Step { Login, Bridge, Alarm }

@Composable
private fun OnboardingFlow(
    activity: ComponentActivity,
    done: () -> Unit,
) {
    val settings = remember { Settings(activity) }
    var step by remember {
        mutableStateOf(if (settings.sessionToken.isNotEmpty()) Step.Bridge else Step.Login)
    }
    when (step) {
        Step.Login ->
            LoginStep(
                activity = activity,
                settings = settings,
                next = { step = Step.Bridge },
            )
        Step.Bridge -> BridgeStep(next = { step = Step.Alarm })
        Step.Alarm -> AlarmStep(activity = activity, done = done)
    }
}

@Composable
private fun LoginStep(
    activity: ComponentActivity,
    settings: Settings,
    next: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    OnboardingPage {
        Box(
            modifier =
                Modifier.size(72.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(Color.White),
            contentAlignment = Alignment.Center,
        ) {
            Image(
                painter = painterResource(R.mipmap.ic_launcher_fg),
                contentDescription = null,
                modifier = Modifier.fillMaxSize(),
            )
        }
        Spacer(Modifier.size(16.dp))
        Text("アサトモ", style = MaterialTheme.typography.headlineLarge)
        Spacer(Modifier.size(12.dp))
        Text(
            "ひとり暮らしの毎日に、\nゆるく見守り合える友を。",
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.size(40.dp))
        Button(
            enabled = !busy,
            onClick = {
                busy = true
                error = null
                scope.launch {
                    AuthClient.signInWithGoogle(activity, settings)
                        .fold(
                            onSuccess = { next() },
                            onFailure = {
                                error = it.message ?: "ログインできませんでした"
                                busy = false
                            },
                        )
                }
            },
        ) {
            Text(if (busy) "ログイン中…" else "Google でログイン")
        }
        error?.let {
            Spacer(Modifier.size(12.dp))
            Text(
                "ログインできませんでした: $it",
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
private fun BridgeStep(next: () -> Unit) {
    OnboardingPage {
        Box(
            modifier =
                Modifier.size(72.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(Color.White),
            contentAlignment = Alignment.Center,
        ) {
            Image(
                painter = painterResource(R.mipmap.ic_launcher_fg),
                contentDescription = null,
                modifier = Modifier.fillMaxSize(),
            )
        }
        Spacer(Modifier.size(16.dp))
        Text(
            "目覚ましを止めるだけで、\n見守ってくれる人に\n「今日も元気」が伝わります",
            style = MaterialTheme.typography.titleLarge,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.size(20.dp))
        Text(
            "アプリを開いたことや「ごはん」などの操作も、\n「元気」として自動で記録され、\nあなたが選んだ相手にだけ伝わります。\n何時に伝わったかの細かい時刻は伝わりません。",
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.size(40.dp))
        Button(onClick = next) { Text("目覚ましをセットする") }
    }
}

@Composable
private fun AlarmStep(activity: ComponentActivity, done: () -> Unit) {
    var message by remember { mutableStateOf("") }

    OnboardingPage {
        Text("毎朝の目覚まし", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.size(12.dp))
        Text(
            "いつもの起きる時刻にセットしてください。\n毎日この時刻に鳴ります（あとで変えられます）。",
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.size(32.dp))
        Button(
            onClick = {
                val now = Calendar.getInstance()
                TimePickerDialog(
                    activity,
                    { _, h, m ->
                        message = AlarmScheduler.setDailyAlarm(activity, h, m)
                        done()
                    },
                    now.get(Calendar.HOUR_OF_DAY),
                    now.get(Calendar.MINUTE),
                    true,
                ).show()
            },
        ) {
            Text("時刻を選ぶ")
        }
        if (message.isNotEmpty()) {
            Spacer(Modifier.size(12.dp))
            Text(message, style = MaterialTheme.typography.bodyMedium)
        }
        Spacer(Modifier.size(16.dp))
        TextButton(onClick = done) { Text("あとで設定する") }
    }
}

@Composable
private fun OnboardingPage(content: @Composable () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        content()
    }
}
