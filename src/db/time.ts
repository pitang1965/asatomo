/**
 * SQLite（D1）の `integer({mode:'timestamp'})` 列は unix秒で格納される。生SQL内で
 * 時刻を比較・演算する箇所（cron/monitoring-tick.ts、domain/monitoring.ts）は、
 * drizzleが自動変換しないためこのヘルパーで明示的に秒へ変換してバインドする。
 */
export function toEpochSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}
