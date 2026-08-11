package com.asatomo.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * ボタンの中身。処理中は小さなスピナー＋文言に差し替えて、押した瞬間の反応（＝押した感）を返す。
 * 通信は数秒かかるので即時フィードバックが要る。Web の <Spinner/> と対になる共通部品。
 */
@Composable
fun LoadingButtonContent(
    label: String,
    loading: Boolean,
    loadingLabel: String = "送信中…",
) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (loading) {
            CircularProgressIndicator(
                modifier = Modifier.size(16.dp),
                strokeWidth = 2.dp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(loadingLabel)
        } else {
            Text(label)
        }
    }
}
