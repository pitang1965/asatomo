import { desc, eq } from 'drizzle-orm';
import { createDb } from '../src/db';
import { session, signals, subjectSettings, user } from '../src/db/schema';
import { loadEnv } from './dev-db';

/** 実機検証用（読み取り専用）: メールでユーザーを引き、セッション・シグナル・監視行を表示。 */
loadEnv();

const fmt = (d: Date | null | undefined) =>
  d ? d.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '—';

async function main() {
  const db = createDb(process.env.DATABASE_URL as string);
  const email = process.argv[2];
  if (!email) throw new Error('メールアドレスを引数に指定してください');

  const [u] = await db
    .select({ id: user.id, name: user.name, createdAt: user.createdAt })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (!u) {
    console.log('ユーザーが見つかりません');
    return;
  }
  console.log(`user: ${u.id}  ${u.name}  作成 ${fmt(u.createdAt)}`);

  const sessions = await db
    .select({ createdAt: session.createdAt, expiresAt: session.expiresAt })
    .from(session)
    .where(eq(session.userId, u.id))
    .orderBy(desc(session.createdAt))
    .limit(2);
  for (const s of sessions) {
    console.log(`session: 作成 ${fmt(s.createdAt)} 期限 ${fmt(s.expiresAt)}`);
  }

  const [ss] = await db
    .select({
      state: subjectSettings.state,
      lastSignalAt: subjectSettings.lastSignalAt,
    })
    .from(subjectSettings)
    .where(eq(subjectSettings.userId, u.id))
    .limit(1);
  console.log(
    ss
      ? `subjectSettings: state=${ss.state} lastSignalAt=${fmt(ss.lastSignalAt)}`
      : 'subjectSettings: なし',
  );

  const sig = await db
    .select({
      kind: signals.kind,
      occurredAt: signals.occurredAt,
      receivedAt: signals.receivedAt,
    })
    .from(signals)
    .where(eq(signals.subjectUserId, u.id))
    .orderBy(desc(signals.receivedAt))
    .limit(3);
  for (const r of sig) {
    console.log(
      `signal: ${r.kind}  発生 ${fmt(r.occurredAt)} / 受信 ${fmt(r.receivedAt)}`,
    );
  }
}

main().then(() => process.exit(0));
