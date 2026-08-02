import { createDb } from '../src/db';
import { connections, signals, subjectSettings, user } from '../src/db/schema';
import { loadEnv } from './dev-db';

/**
 * ストアスクショ専用シード（開発DBのみ）。実ユーザーのデータには一切触れず、
 * 架空の見守り者 seed-shot-owner が、架空の本人4人を見守っている状態を作る。
 * さらに owner 自身も架空のウォッチャー 1 人に見守られている状態にする
 * （youAreWatched=true → アプリが「元気が伝わります」の前向き文言になる。ストア用）。
 * このユーザーでログイン（DEV_BEARER 注入）して撮ると、実名（牧野将治）が出ない。
 *
 * 実行: npx tsx scripts/seed-shot.ts   → 末尾に owner の userId を表示。
 * 冪等（何度実行しても同じ）。本番へは touch しない（file-per-env）。
 */
loadEnv();
if (!process.env.DATABASE_URL)
  throw new Error('DATABASE_URL がありません（.env.local を確認してください）');
const db = createDb(process.env.DATABASE_URL);
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

const OWNER = {
  id: 'seed-shot-owner',
  name: 'デモ ユーザー',
  email: 'seed-shot-owner@example.invalid',
};

// owner を見守る架空のウォッチャー（youAreWatched=true 用）。
// アプリのメイン画面に名前は出ない（コピー分岐のためだけに存在）。
const WATCHER = {
  id: 'seed-shot-watcher',
  name: '中村 ゆい',
  email: 'seed-shot-watcher@example.invalid',
};

// 架空の本人たち（実名を避けた一般的なサンプル名。「(テスト)」表記は付けない）。
const SUBJECTS = [
  {
    id: 'seed-shot-a',
    name: '田中 みなみ',
    email: 'seed-shot-a@example.invalid',
    state: 'normal' as const,
    presence: 'none' as const,
    presenceSince: null as Date | null,
    signal: { kind: 'meal' as const, hours: 2 },
  },
  {
    id: 'seed-shot-b',
    name: '佐藤 健太',
    email: 'seed-shot-b@example.invalid',
    state: 'normal' as const,
    presence: 'none' as const,
    presenceSince: null as Date | null,
    signal: { kind: 'web_checkin' as const, hours: 5 },
  },
  {
    id: 'seed-shot-c',
    name: '山本 涼',
    email: 'seed-shot-c@example.invalid',
    state: 'normal' as const,
    presence: 'sleeping' as const,
    presenceSince: hoursAgo(8),
    signal: { kind: 'sleep' as const, hours: 8 },
  },
  {
    id: 'seed-shot-d',
    name: '鈴木 あかり',
    email: 'seed-shot-d@example.invalid',
    state: 'normal' as const,
    presence: 'none' as const,
    presenceSince: null as Date | null,
    signal: { kind: 'app_open' as const, hours: 1 },
  },
];

// 固定シグナルID（冪等）。
const SIG_PREFIX = '33333333-3333-4333-8333-3333333333';

async function main() {
  await db
    .insert(user)
    .values([
      OWNER,
      WATCHER,
      ...SUBJECTS.map((s) => ({ id: s.id, name: s.name, email: s.email })),
    ])
    .onConflictDoNothing();

  for (const s of SUBJECTS) {
    const row = {
      userId: s.id,
      state: s.state,
      stateChangedAt: hoursAgo(s.signal.hours),
      lastSignalAt: hoursAgo(s.signal.hours),
      currentPresence: s.presence,
      presenceSince: s.presenceSince,
    };
    await db
      .insert(subjectSettings)
      .values(row)
      .onConflictDoUpdate({ target: subjectSettings.userId, set: row });
  }

  await db
    .insert(signals)
    .values(
      SUBJECTS.map((s, i) => ({
        id: `${SIG_PREFIX}${(i + 1).toString().padStart(2, '0')}`,
        subjectUserId: s.id,
        kind: s.signal.kind,
        occurredAt: hoursAgo(s.signal.hours),
      })),
    )
    .onConflictDoNothing();

  // owner が各本人を見守る（承諾済み）。
  await db
    .insert(connections)
    .values(
      SUBJECTS.map((s) => ({
        subjectUserId: s.id,
        otherUserId: OWNER.id,
        displayName: OWNER.name,
        isWatcher: true,
        watcherStatus: 'accepted' as const,
        watcherLastSeenAt: new Date(),
        invitedAt: hoursAgo(24 * 7),
        respondedAt: hoursAgo(24 * 7),
      })),
    )
    .onConflictDoNothing();

  // owner 自身も見守られている（youAreWatched=true → 前向き文言）。
  await db
    .insert(connections)
    .values({
      subjectUserId: OWNER.id,
      otherUserId: WATCHER.id,
      displayName: WATCHER.name,
      isWatcher: true,
      watcherStatus: 'accepted' as const,
      watcherLastSeenAt: new Date(),
      invitedAt: hoursAgo(24 * 7),
      respondedAt: hoursAgo(24 * 7),
    })
    .onConflictDoNothing();

  console.log(`owner userId: ${OWNER.id}`);
  console.log(`本人 ${SUBJECTS.length} 人（実名なし）を ${OWNER.name} が見守る状態にしました。`);
  console.log(`さらに ${OWNER.name} を ${WATCHER.name} が見守る状態（youAreWatched=true）にしました。`);
}

await main();
