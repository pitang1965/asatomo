package com.asatomo.app

import android.Manifest
import android.app.TimePickerDialog
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.work.WorkInfo
import androidx.work.WorkManager
import com.asatomo.app.ui.theme.AsatomoTheme
import java.util.Calendar
import java.util.UUID
import kotlinx.coroutines.launch

/**
 * メイン画面（グリル決定: 未来スロット型）。基本は目覚ましに徹し、見守られる側だけで使う人に
 * 無関係な欄は出さない（対象がいる人だけに見守り欄を見せる）。
 *   - 毎朝の目覚まし（AlarmScheduler → AlarmReceiver → AlarmActivity）
 *   - いまの様子を伝える（おはよう / ごはん / おやすみ / いってきます / ただいま）
 *   - あなたが見守っている人（見守り対象が1人以上のときだけ表示。Web リンク。ADR-0006）
 *   - 右上 ⚙ → 設定画面（ログアウト等）
 *   - アプリ起動の自動シグナル（透明性の原則: 画面に明示する。CONTEXT.md 生存シグナル）
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 未ログインなら初回フロー（ログイン → 橋渡し → アラーム設定）へ。
        val settings = Settings(this)
        if (!settings.isConfigured) {
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
            AsatomoTheme { MainScreen() }
        }
    }

    companion object {
        const val APP_OPEN_THROTTLE_MS = 15 * 60_000L
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MainScreen() {
    val context = LocalContext.current
    val settings = remember { Settings(context) }
    val scope = rememberCoroutineScope()

    var status by remember { mutableStateOf("") }
    var trackedWork by remember { mutableStateOf<UUID?>(null) }
    var trackedLabel by remember { mutableStateOf("") }

    // 見守りの一瞥（サーバー整形済み。null = 読み込み中）。attest 後は reload++ で再取得。
    var watchRows by remember { mutableStateOf<List<ApiClient.WatchSubject>?>(null) }
    var watchReload by remember { mutableStateOf(0) }
    var attestBusy by remember { mutableStateOf(false) }

    // 自分を見守っている人がいるか（コピー分岐用。既定はキャッシュ値、overview で最新化）。
    var hasWatchers by remember { mutableStateOf(settings.hasWatchers) }

    LaunchedEffect(watchReload) {
        ApiClient.watchOverview(settings)
            .fold(
                onSuccess = {
                    watchRows = it.subjects
                    settings.hasWatchers = it.youAreWatched
                    hasWatchers = it.youAreWatched
                },
                onFailure = {
                    // 取得失敗時はカードを出さない（見守り対象0人と同じ扱い）。
                    watchRows = emptyList()
                },
            )
    }
    var alarmText by
        remember {
            mutableStateOf(
                if (settings.hasAlarm) {
                    AlarmScheduler.label(settings.alarmHour, settings.alarmMinute)
                } else {
                    ""
                },
            )
        }

    // アラーム音量が0＝目覚ましが鳴らない状態の警告（ADR-0009）。アラーム設定済みのときだけ意味を持つ。
    // 前面復帰のたびに読み直す（サウンド設定から戻った時・別アプリで音量を変えた時も鮮度を保つ）。
    var alarmMuted by
        remember { mutableStateOf(settings.hasAlarm && AlarmAudio.isMuted(context)) }
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer =
            LifecycleEventObserver { _, event ->
                if (event == Lifecycle.Event.ON_RESUME) {
                    alarmMuted = settings.hasAlarm && AlarmAudio.isMuted(context)
                }
            }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
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

    fun send(kind: ApiClient.SignalKind, label: String) {
        trackedLabel = label
        trackedWork = SignalQueue.enqueue(context, kind)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier =
                                Modifier.size(28.dp)
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(Color.White),
                            contentAlignment = Alignment.Center,
                        ) {
                            Image(
                                painter = painterResource(R.mipmap.ic_launcher_fg),
                                contentDescription = null,
                                modifier = Modifier.fillMaxSize(),
                            )
                        }
                        Spacer(Modifier.size(8.dp))
                        Text("アサトモ目覚まし")
                    }
                },
                actions = {
                    IconButton(
                        onClick = {
                            context.startActivity(Intent(context, SettingsActivity::class.java))
                        },
                    ) {
                        Text("⚙", fontSize = 22.sp)
                    }
                },
            )
        },
    ) { inner ->
        Column(
            modifier =
                Modifier.fillMaxSize()
                    .padding(inner)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 4.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // ── 毎日の目覚まし ──（夜勤の人もいるので「毎朝」ではなく「毎日」）
            SectionCard(title = "⏰ 毎日の目覚まし") {
                Text(
                    if (hasWatchers) {
                        "セットした時刻に毎日鳴ります。止めるだけで、見守ってくれる人に今日の「元気」が伝わります。"
                    } else {
                        "セットした時刻に毎日鳴ります。見守り合う友を招くと、止めるだけで「元気」が届くようになります。"
                    },
                    style = MaterialTheme.typography.bodySmall,
                )
                if (alarmText.isNotEmpty()) {
                    Text(
                        alarmText,
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                    )
                }
                // 道具の不調として平易に告げる（監視感・技術語・「マナーモード解除」は書かない。ADR-0009 決定6）。
                if (alarmMuted) {
                    Text(
                        "⚠ アラームの音量がゼロになっています。\nこのままでは、時刻になっても音が鳴りません。",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error,
                    )
                    Button(
                        onClick = {
                            AlarmAudio.makeAudible(context)
                            alarmMuted = settings.hasAlarm && AlarmAudio.isMuted(context)
                        },
                    ) {
                        Text("アラームの音を出せるようにする")
                    }
                }
                Button(
                    onClick = {
                        val now = Calendar.getInstance()
                        TimePickerDialog(
                            context,
                            { _, h, m ->
                                alarmText = AlarmScheduler.setDailyAlarm(context, h, m)
                                // セット直後の教育の瞬間: 今セットしたのに音が0なら即警告する。
                                alarmMuted = settings.hasAlarm && AlarmAudio.isMuted(context)
                            },
                            if (settings.hasAlarm) settings.alarmHour else now.get(Calendar.HOUR_OF_DAY),
                            if (settings.hasAlarm) settings.alarmMinute else now.get(Calendar.MINUTE),
                            true,
                        ).show()
                    },
                ) {
                    Text(if (settings.hasAlarm) "アラーム時刻を変える" else "アラームをセット")
                }
            }

            // ── いまの様子を伝える ──
            SectionCard(title = "📣 いまの様子を伝える") {
                // 「おはよう」＝見守られる側の能動的な生存/起床連絡。実質のメイン操作なので、
                // ほかのボタンより目立つ塗り Button・全幅で最上段に置く。
                Button(
                    onClick = { send(ApiClient.SignalKind.WAKE, "おはよう") },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("☀️ おはよう")
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { send(ApiClient.SignalKind.MEAL, "ごはん") }) {
                        Text("🍚 ごはん")
                    }
                    OutlinedButton(onClick = { send(ApiClient.SignalKind.SLEEP, "おやすみ") }) {
                        Text("🌙 おやすみ")
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { send(ApiClient.SignalKind.OUTING, "いってきます") }) {
                        Text("👋 いってきます")
                    }
                    OutlinedButton(onClick = { send(ApiClient.SignalKind.HOMECOMING, "ただいま") }) {
                        Text("🏠 ただいま")
                    }
                }
                // 透明性の原則: 自動記録を隠さない（CONTEXT.md 生存シグナル）。
                Text(
                    if (hasWatchers) {
                        "このアプリを開いたことも「元気」として自動で伝わります。"
                    } else {
                        "このアプリを開いたことも「元気」のもとになります。届け先ができると自動で伝わります。"
                    },
                    style = MaterialTheme.typography.bodySmall,
                )
                if (status.isNotEmpty()) {
                    Text(status, style = MaterialTheme.typography.bodyMedium)
                }
            }

            // ── あなたが見守っている人 ──
            //    見守り対象が1人以上のときだけ表示（0人＝見守られる専用の人には無関係な欄を出さない）。
            //    近況の一瞥＋代理確認。重いフローは Web へ（ADR-0006）。本人文脈（見守ってくれる人）と
            //    混在するため主語を明示する（CONTEXT.md 本人）。
            val watchingRows = watchRows
            if (!watchingRows.isNullOrEmpty()) {
                SectionCard(title = "👀 あなたが見守っている人") {
                    watchingRows.forEach { row ->
                        WatchRow(
                            row = row,
                            attestBusy = attestBusy,
                            onAttest = {
                                attestBusy = true
                                scope.launch {
                                    ApiClient.attest(settings, row.subjectUserId)
                                    attestBusy = false
                                    watchReload++
                                }
                            },
                        )
                    }
                    // 高齢者には製品名より目的が分かりやすいので、改名せず目的ラベルのまま維持する。
                    OutlinedButton(
                        onClick = {
                            CustomTabsIntent.Builder()
                                .build()
                                .launchUrl(context, Uri.parse(BuildConfig.BASE_URL))
                        },
                    ) {
                        Text("様子をWebで見る ↗")
                    }
                }
            }

            Spacer(Modifier.size(8.dp))
        }
    }
}

/** 見守っている人1人ぶんの行（名前・状態ラベル・近況・注記・要確認時の代理確認）。 */
@Composable
private fun WatchRow(
    row: ApiClient.WatchSubject,
    attestBusy: Boolean,
    onAttest: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Row(
            horizontalArrangement = Arrangement.SpaceBetween,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(row.name, style = MaterialTheme.typography.titleSmall)
            Text(
                row.label,
                style = MaterialTheme.typography.labelMedium,
                color =
                    when (row.level) {
                        "warn" -> MaterialTheme.colorScheme.error
                        "travel" -> MaterialTheme.colorScheme.tertiary
                        "night" -> MaterialTheme.colorScheme.onSurfaceVariant
                        else -> MaterialTheme.colorScheme.primary
                    },
            )
        }
        Text(row.statusText, style = MaterialTheme.typography.bodySmall)
        row.note?.let {
            Text(
                it,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
        }
        row.alertText?.let {
            Text(
                it,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
            OutlinedButton(onClick = onAttest, enabled = !attestBusy) {
                Text("連絡がついた・無事です")
            }
        }
    }
}

/** セクション1枚ぶんのカード（見出し + 内容）。 */
@Composable
private fun SectionCard(title: String, content: @Composable () -> Unit) {
    ElevatedCard(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            content()
        }
    }
}
