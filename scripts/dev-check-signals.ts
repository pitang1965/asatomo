import { desc, eq } from 'drizzle-orm';
import { signals, subjectSettings } from '../src/db/schema';
import { getLocalD1Db, loadEnv } from './dev-db';

/**
 * 実機検証用: 本人の直近シグナルと lastSignalAt を表示する。
 * 実行: npx tsx scripts/dev-check-signals.ts [subjectUserId]（既定 seed-subject-sato）
 */

loadEnv();

async function main() {
  const db = getLocalD1Db();
  const subject = process.argv[2] ?? 'seed-subject-sato';

  const rows = await db
    .select({
      kind: signals.kind,
      occurredAt: signals.occurredAt,
      receivedAt: signals.receivedAt,
    })
    .from(signals)
    .where(eq(signals.subjectUserId, subject))
    .orderBy(desc(signals.receivedAt))
    .limit(5);

  const [s] = await db
    .select({
      lastSignalAt: subjectSettings.lastSignalAt,
      state: subjectSettings.state,
      travelUntil: subjectSettings.travelUntil,
      travelStartedAt: subjectSettings.travelStartedAt,
    })
    .from(subjectSettings)
    .where(eq(subjectSettings.userId, subject))
    .limit(1);

  const fmt = (d: Date | null) =>
    d ? d.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '—';

  const now = Date.now();
  const travelActive = !!s?.travelUntil && s.travelUntil.getTime() > now;

  console.log(`subject=${subject}`);
  console.log(
    `state=${s?.state}  lastSignalAt=${fmt(s?.lastSignalAt ?? null)}`,
  );
  console.log(
    `旅行モード=${travelActive ? '有効' : '無効'}  travelUntil=${fmt(s?.travelUntil ?? null)}  開始=${fmt(s?.travelStartedAt ?? null)}`,
  );
  console.log('直近シグナル（新しい順）:');
  for (const r of rows) {
    console.log(
      `  ${r.kind.padEnd(13)} 発生 ${fmt(r.occurredAt)} / 受信 ${fmt(r.receivedAt)}`,
    );
  }
}

main().then(() => process.exit(0));
