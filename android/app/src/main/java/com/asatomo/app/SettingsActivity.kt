package com.asatomo.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.work.WorkManager
import com.asatomo.app.ui.theme.AsatomoTheme
import kotlinx.coroutines.launch

/**
 * 設定画面。ログアウトは最下部（グリル決定: 一等地に置かない）。
 * ログアウトの流れ:
 *   1. サーバーへ「ログアウトした」事実を記録（見守り者への状態可視化。ベストエフォート）
 *   2. Better Auth セッションを失効（ベストエフォート）
 *   3. アラーム解除 + 送信キュー破棄 + 端末のログイン状態クリア
 * 監視・エスカレーションはサーバー側で継続する（期限なしの盲点を作らない）。
 */
class SettingsActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            AsatomoTheme {
                SettingsScreen(
                    back = { finish() },
                    loggedOut = {
                        // ログイン前提の画面を全て畳んで初回フローへ。
                        startActivity(
                            Intent(this, OnboardingActivity::class.java)
                                .addFlags(
                                    Intent.FLAG_ACTIVITY_NEW_TASK or
                                        Intent.FLAG_ACTIVITY_CLEAR_TASK,
                                ),
                        )
                        finish()
                    },
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SettingsScreen(back: () -> Unit, loggedOut: () -> Unit) {
    val context = LocalContext.current
    val settings = remember { Settings(context) }
    val scope = rememberCoroutineScope()
    var confirming by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("設定") },
                navigationIcon = {
                    IconButton(onClick = back) { Text("←", fontSize = 22.sp) }
                },
            )
        },
    ) { inner ->
        Column(
            modifier = Modifier.fillMaxSize().padding(inner).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("アカウント", style = MaterialTheme.typography.titleMedium)
            Text(
                if (settings.userName.isNotEmpty()) {
                    "${settings.userName} さんとしてログイン中"
                } else {
                    "ログイン中"
                },
                style = MaterialTheme.typography.bodyMedium,
            )

            Spacer(Modifier.weight(1f))

            OutlinedButton(
                onClick = { confirming = true },
                enabled = !busy,
                modifier = Modifier.fillMaxWidth(),
                colors =
                    ButtonDefaults.outlinedButtonColors(
                        contentColor = MaterialTheme.colorScheme.error,
                    ),
            ) {
                Text(if (busy) "ログアウト中…" else "ログアウト")
            }
            Text(
                "アサトモ ${BuildConfig.VERSION_NAME}",
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.align(Alignment.CenterHorizontally),
            )
        }
    }

    if (confirming) {
        AlertDialog(
            onDismissRequest = { confirming = false },
            title = { Text("ログアウトしますか？") },
            text = {
                Text(
                    "ログアウトすると、見守ってくれる人に「元気」が届かなくなります。" +
                        "毎朝の目覚ましも解除されます。\n" +
                        "見守ってくれる人には「アプリからログアウト中」と伝わります。",
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirming = false
                        busy = true
                        scope.launch {
                            // 1. 事実の記録 → 2. セッション失効（どちらもベストエフォート）。
                            ApiClient.recordLogout(settings)
                            ApiClient.signOut(settings)
                            // 3. 端末側の後片付け。古いトークンで再送し続けないようキューも破棄。
                            AlarmScheduler.cancel(context)
                            WorkManager.getInstance(context).cancelAllWork()
                            settings.clearForLogout()
                            loggedOut()
                        }
                    },
                ) {
                    Text("ログアウトする", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirming = false }) { Text("やめる") }
            },
        )
    }
}
