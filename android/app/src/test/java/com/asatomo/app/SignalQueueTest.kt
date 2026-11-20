package com.asatomo.app

import java.io.IOException
import java.util.UUID
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** ログアウト前の送り切りは、タグから種類と発生時刻を正しく取り戻せることが前提。 */
class SignalQueueTest {
    @Test
    fun `restores kind and occurredAt from tags`() {
        val tags =
            setOf(
                SignalWorker::class.java.name,
                SignalQueue.TAG_KIND + "alarm_dismiss",
                SignalQueue.TAG_AT + "1763600000000",
            )

        assertEquals(
            ApiClient.SignalKind.ALARM_DISMISS to 1763600000000L,
            SignalQueue.parseTags(tags),
        )
    }

    @Test
    fun `untagged or broken work is not restored`() {
        assertNull(SignalQueue.parseTags(setOf(SignalWorker::class.java.name)))
        assertNull(SignalQueue.parseTags(setOf(SignalQueue.TAG_KIND + "nope", SignalQueue.TAG_AT + "1")))
        assertNull(SignalQueue.parseTags(setOf(SignalQueue.TAG_KIND + "wake", SignalQueue.TAG_AT + "x")))
    }

    private fun queued(kind: String, at: Long) =
        UUID.randomUUID() to setOf(SignalQueue.TAG_KIND + kind, SignalQueue.TAG_AT + at)

    @Test
    fun `sent and permanently rejected work leaves the queue`() = runBlocking {
        val ok = queued("alarm_dismiss", 1)
        val rejected = queued("wake", 2)
        val (done, result) =
            SignalQueue.planFlush(listOf(ok, rejected)) { _, at ->
                if (at == 1L) Result.success("{}") else Result.failure<String>(ApiClient.PermanentFailure("400"))
            }

        assertEquals(listOf(ok.first, rejected.first), done)
        assertEquals(SignalQueue.FlushResult(unsent = 0, authExpired = false), result)
    }

    @Test
    fun `network failure keeps work queued and stops sending the rest`() = runBlocking {
        var calls = 0
        val (done, result) =
            SignalQueue.planFlush(listOf(queued("alarm_dismiss", 1), queued("wake", 2))) { _, _ ->
                calls++
                Result.failure<String>(IOException("offline"))
            }

        assertEquals(emptyList<UUID>(), done)
        assertEquals(SignalQueue.FlushResult(unsent = 2, authExpired = false), result)
        assertEquals(1, calls)
    }

    @Test
    fun `expired login is reported and untagged work counts as unsent`() = runBlocking {
        val untagged = UUID.randomUUID() to setOf(SignalWorker::class.java.name)
        val (done, result) =
            SignalQueue.planFlush(listOf(untagged, queued("alarm_dismiss", 1))) { _, _ ->
                Result.failure<String>(ApiClient.AuthFailure("401"))
            }

        assertEquals(emptyList<UUID>(), done)
        assertEquals(SignalQueue.FlushResult(unsent = 2, authExpired = true), result)
    }
}
