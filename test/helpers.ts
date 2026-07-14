import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import type { Db } from '../src/db';
import * as schema from '../src/db/schema';

/**
 * インメモリ Postgres（pglite）に実マイグレーション（drizzle/0000_init.sql）を適用し、
 * ドメイン/Cron を実際に走らせて状態機械を検証するためのテスト用 DB。
 * ドライバは異なる（pglite vs neon-http）がクエリビルダ API は同一なので Db にキャストする。
 */
export async function makeTestDb(): Promise<Db> {
  const client = new PGlite();
  const sql = readFileSync('drizzle/0000_init.sql', 'utf8').replaceAll(
    '--> statement-breakpoint',
    '',
  );
  await client.exec(sql);
  return drizzle(client, { schema }) as unknown as Db;
}

let seq = 0;
function uid(prefix: string): string {
  seq += 1;
  return `${prefix}_${seq}`;
}

/** アカウントだけの user を作る（つながり未接続）。招待テスト用。 */
export async function seedUser(db: Db, prefix = 'user'): Promise<string> {
  const id = uid(prefix);
  await db
    .insert(schema.user)
    .values({ id, name: id, email: `${id}@example.test` });
  return id;
}

/** 本人（被見守り）を作る。subjectSettings も同時に用意。 */
export async function seedSubject(
  db: Db,
  opts: {
    state?: (typeof schema.subjectSettings.state.enumValues)[number];
    lastSignalAt?: Date | null;
    stateChangedAt?: Date;
    travelUntil?: Date | null;
    detectionWindowHours?: number;
    gracePeriodHours?: number;
  } = {},
): Promise<string> {
  const id = uid('subject');
  await db.insert(schema.user).values({
    id,
    name: id,
    email: `${id}@example.test`,
  });
  await db.insert(schema.subjectSettings).values({
    userId: id,
    state: opts.state ?? 'normal',
    lastSignalAt: opts.lastSignalAt ?? null,
    stateChangedAt: opts.stateChangedAt ?? new Date(),
    travelUntil: opts.travelUntil ?? null,
    detectionWindowHours: opts.detectionWindowHours ?? 30,
    gracePeriodHours: opts.gracePeriodHours ?? 48,
  });
  return id;
}

/** 見守り者（アカウントあり）を本人につなぐ。 */
export async function seedWatcher(
  db: Db,
  subjectUserId: string,
  opts: {
    accepted?: boolean;
    lastSeenAt?: Date | null;
  } = {},
): Promise<string> {
  const watcherId = uid('watcher');
  await db.insert(schema.user).values({
    id: watcherId,
    name: watcherId,
    email: `${watcherId}@example.test`,
  });
  await db.insert(schema.connections).values({
    subjectUserId,
    otherUserId: watcherId,
    displayName: watcherId,
    isWatcher: true,
    watcherStatus: opts.accepted === false ? 'pending' : 'accepted',
    watcherLastSeenAt:
      opts.lastSeenAt === undefined ? new Date() : opts.lastSeenAt,
  });
  return watcherId;
}

/** 進行中の死亡認定エピソードを作る（stage 指定・startedAt で床を制御）。 */
export async function seedCertification(
  db: Db,
  subjectUserId: string,
  opts: {
    stage?: (typeof schema.deathCertifications.stage.enumValues)[number];
    startedAt?: Date;
  } = {},
): Promise<string> {
  const [row] = await db
    .insert(schema.deathCertifications)
    .values({
      subjectUserId,
      stage: opts.stage ?? 'watchers_alerted',
      startedAt: opts.startedAt ?? new Date(),
    })
    .returning({ id: schema.deathCertifications.id });
  return row.id;
}

export function hoursAgo(h: number, from: Date = new Date()): Date {
  return new Date(from.getTime() - h * 3_600_000);
}
