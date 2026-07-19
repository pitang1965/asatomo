import { readFileSync } from 'node:fs';
import { desc, eq } from 'drizzle-orm';
import { createDb } from '../src/db';
import { signals, subjectSettings } from '../src/db/schema';

/**
 * 実機検証用: 本人の直近シグナルと lastSignalAt を表示する。
 * 実行: npx tsx scripts/dev-check-signals.ts [subjectUserId]（既定 seed-subject-sato）
 */

// .env の簡易読み込み（seed-dev.ts と同じ）。
if (!process.env.DATABASE_URL) {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0 && !line.startsWith('#')) {
      const key = line.slice(0, i).trim();
      if (!process.env[key]) process.env[key] = line.slice(i + 1).trim();
    }
  }
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL がありません');

async function main() {
  const db = createDb(process.env.DATABASE_URL as string);
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
