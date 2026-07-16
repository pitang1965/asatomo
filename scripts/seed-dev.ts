import { readFileSync } from 'node:fs';
import { asc, inArray } from 'drizzle-orm';
import { createDb } from '../src/db';
import {
  connections,
  deathCertifications,
  signals,
  subjectSettings,
  user,
} from '../src/db/schema';

/**
 * 開発用シード。最初にログインした実ユーザーを見守り者として、テストの「本人」3人と
 * つながり（承諾済み見守り）を投入する。何度実行しても安全（upsert）で、
 * 佐藤（アラート中）は再実行のたびに watchers_alerted へ戻る（「無事です」の動作確認用）。
 *
 * 実行: npx tsx scripts/seed-dev.ts
 */

// .env の簡易読み込み(依存パッケージなし。値に = を含む場合も考慮)。
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

const db = createDb(process.env.DATABASE_URL);
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

const SUBJECTS = [
  {
    id: 'seed-subject-sato',
    name: '佐藤 健太（テスト）',
    email: 'seed-sato@example.invalid',
  },
  {
    id: 'seed-subject-tanaka',
    name: '田中 みなみ（テスト）',
    email: 'seed-tanaka@example.invalid',
  },
  {
    id: 'seed-subject-yamamoto',
    name: '山本 涼（テスト）',
    email: 'seed-yamamoto@example.invalid',
  },
] as const;

const CERT_ID = '11111111-1111-4111-8111-111111111111';
const SIGNAL_IDS = {
  sato: '22222222-2222-4222-8222-222222222201',
  tanaka: '22222222-2222-4222-8222-222222222202',
  yamamoto: '22222222-2222-4222-8222-222222222203',
} as const;

async function main() {
  // 見守り者 = 最初に登録された実ユーザー（seed- 以外）。
  const users = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .orderBy(asc(user.createdAt));
  const watcher = users.find((u) => !u.id.startsWith('seed-'));
  if (!watcher)
    throw new Error(
      '実ユーザーが見つかりません。先に見守りWebでログインしてください。',
    );
  console.log(`見守り者: ${watcher.name} (${watcher.id})`);

  await db
    .insert(user)
    .values([...SUBJECTS])
    .onConflictDoNothing();

  // 本人設定。再実行時も状態を上書きして初期シナリオへ戻す。
  const settings = [
    {
      userId: 'seed-subject-sato',
      state: 'watchers_alerted' as const,
      stateChangedAt: hoursAgo(20),
      lastSignalAt: hoursAgo(32),
      currentPresence: 'none' as const,
      presenceSince: null,
    },
    {
      userId: 'seed-subject-tanaka',
      state: 'normal' as const,
      stateChangedAt: hoursAgo(2),
      lastSignalAt: hoursAgo(2),
      currentPresence: 'none' as const,
      presenceSince: null,
    },
    {
      userId: 'seed-subject-yamamoto',
      state: 'normal' as const,
      stateChangedAt: hoursAgo(8),
      lastSignalAt: hoursAgo(8),
      currentPresence: 'sleeping' as const,
      presenceSince: hoursAgo(8),
    },
  ];
  for (const s of settings) {
    await db
      .insert(subjectSettings)
      .values(s)
      .onConflictDoUpdate({ target: subjectSettings.userId, set: s });
  }

  // 近況の材料になるシグナル（固定IDで冪等）。
  await db
    .insert(signals)
    .values([
      {
        id: SIGNAL_IDS.sato,
        subjectUserId: 'seed-subject-sato',
        kind: 'meal',
        occurredAt: hoursAgo(32),
      },
      {
        id: SIGNAL_IDS.tanaka,
        subjectUserId: 'seed-subject-tanaka',
        kind: 'meal',
        occurredAt: hoursAgo(2),
      },
      {
        id: SIGNAL_IDS.yamamoto,
        subjectUserId: 'seed-subject-yamamoto',
        kind: 'sleep',
        occurredAt: hoursAgo(8),
      },
    ])
    .onConflictDoNothing();

  // 佐藤のアラートに対応する認定エピソード（attest が解決対象にする形）。
  const cert = {
    id: CERT_ID,
    subjectUserId: 'seed-subject-sato',
    startedAt: hoursAgo(20),
    stage: 'watchers_alerted' as const,
    outcome: 'in_progress' as const,
    cancelReason: null,
    cancelledAt: null,
    graceUntil: null,
    disclosedAt: null,
  };
  await db
    .insert(deathCertifications)
    .values(cert)
    .onConflictDoUpdate({ target: deathCertifications.id, set: cert });

  // つながり: 各本人 → 実ユーザー（承諾済み見守り者）。
  await db
    .insert(connections)
    .values(
      SUBJECTS.map((s) => ({
        subjectUserId: s.id,
        otherUserId: watcher.id,
        displayName: watcher.name,
        isWatcher: true,
        watcherStatus: 'accepted' as const,
        watcherLastSeenAt: new Date(),
        invitedAt: hoursAgo(24 * 7),
        respondedAt: hoursAgo(24 * 7),
      })),
    )
    .onConflictDoNothing();

  const seeded = await db
    .select({ id: user.id })
    .from(user)
    .where(
      inArray(
        user.id,
        SUBJECTS.map((s) => s.id),
      ),
    );
  console.log(
    `完了: 本人${seeded.length}人（佐藤=アラート中 / 田中・山本=平常）を ${watcher.name} が見守る状態にしました。`,
  );
}

await main();
