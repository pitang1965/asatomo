package com.asatomo.app

import org.junit.Test

import java.util.Calendar
import java.util.GregorianCalendar
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue

/** 早起きスキップの当日判定は端末外でも決定的に検証する。 */
class AlarmSchedulerTest {
    @Test
    fun `today's future alarm can be skipped`() {
        val now = GregorianCalendar(2026, Calendar.AUGUST, 7, 6, 30)

        assertTrue(AlarmScheduler.isAlarmDueToday(7, 0, null, now))
    }

    @Test
    fun `past or already skipped alarm cannot be skipped`() {
        val now = GregorianCalendar(2026, Calendar.AUGUST, 7, 7, 0)

        assertFalse(AlarmScheduler.isAlarmDueToday(7, 0, null, now))
        assertFalse(AlarmScheduler.isAlarmDueToday(8, 0, "2026-08-07", now))
    }
}
