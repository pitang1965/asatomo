package com.asatomo.app

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.provider.Settings as AndroidSettings

/**
 * 目覚まし音の可聴性チェックと復旧（ADR-0009）。
 *
 * アラームは USAGE_ALARM で鳴らす（AlarmReceiver）ため、着信のマナー/サイレント/バイブとは
 * 独立して鳴る。実際に鳴らなくする最頻・権限ゼロの経路＝アラーム音量（STREAM_ALARM）=0 のみを扱う。
 * DND 遮断・「音量が小さいだけ」は、誤報ゼロを最優先する方針のため扱わない（ADR-0009 決定2・3）。
 */
object AlarmAudio {

    /**
     * アラーム音量が 0（ミュート）か。true なら目覚ましが鳴らない。
     *
     * ただし DND（おやすみモード）中は false を返す（＝警告を出さない）。DND 中は端末によって
     * getStreamVolume(STREAM_ALARM) が実設定と無関係に 0 を返し誤報になる一方、アラームは
     * USAGE_ALARM で DND を貫通して鳴る。DND は扱わない方針（ADR-0009 決定2・3）に合わせる。
     */
    fun isMuted(context: Context): Boolean {
        if (isDndActive(context)) return false
        val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        return am.getStreamVolume(AudioManager.STREAM_ALARM) == 0
    }

    /** おやすみモード（DND）が有効か。読み取りのみ（設定変更はしない）で権限不要。 */
    private fun isDndActive(context: Context): Boolean {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val filter = nm.currentInterruptionFilter
        return filter != NotificationManager.INTERRUPTION_FILTER_ALL &&
            filter != NotificationManager.INTERRUPTION_FILTER_UNKNOWN
    }

    /**
     * アラーム音量を確実に聞こえる値（最大の7割）へ上げ、同時にシステムの音量スライダーを見せる。
     * 本人が警告を見て自分で押す明示操作から呼ぶ（発火時の黙った自動介入ではない。ADR-0009 決定5）。
     * DND 等で setStreamVolume が弾かれたら、サウンド設定へ穏当にフォールバックする。
     */
    fun makeAudible(context: Context) {
        val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val max = am.getStreamMaxVolume(AudioManager.STREAM_ALARM)
        val target = (max * 0.7f).toInt().coerceAtLeast(1)
        try {
            am.setStreamVolume(AudioManager.STREAM_ALARM, target, AudioManager.FLAG_SHOW_UI)
        } catch (_: SecurityException) {
            context.startActivity(
                Intent(AndroidSettings.ACTION_SOUND_SETTINGS)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        }
    }
}
