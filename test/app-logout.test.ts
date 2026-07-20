import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db';
import * as schema from '../src/db/schema';
import {
  DEFAULT_DOMAIN_CONFIG,
  recordAppLogout,
  recordSignal,
} from '../src/domain/monitoring';
import { getWatcherDashboard } from '../src/domain/queries';
import {
  hoursAgo,
  makeTestDb,
  seedSubject,
  seedUser,
  seedWatcher,
} from './helpers';

const NOW = new Date('2026-07-20T12:00:00Z');
const cfg = { ...DEFAULT_DOMAIN_CONFIG, now: NOW };

let db: Db;
beforeEach(async () => {
  db = await makeTestDb();
});

async function loggedOutAt(subjectId: string): Promise<Date | null> {
  const [r] = await db
    .select({
      appLoggedOutAt: schema.subjectSettings.appLoggedOutAt,
      state: schema.subjectSettings.state,
    })
    .from(schema.subjectSettings)
    .where(eq(schema.subjectSettings.userId, subjectId))
    .limit(1);
  return r?.appLoggedOutAt ?? null;
}

describe('アプリからのログアウト記録（沈黙の可視化・監視は継続）', () => {
  it('記録すると appLoggedOutAt が立つ。監視状態は変えない', async () => {
    const subject = await seedSubject(db, { lastSignalAt: hoursAgo(1, NOW) });
    await recordAppLogout(db, subject, cfg);
    expect(await loggedOutAt(subject)).toEqual(NOW);
    const [s] = await db
      .select({ state: schema.subjectSettings.state })
      .from(schema.subjectSettings)
      .where(eq(schema.subjectSettings.userId, subject));
    expect(s.state).toBe('normal');
  });

  it('subjectSettings 行がない本人（未シグナル）でも upsert で記録できる', async () => {
    const userId = await seedUser(db);
    await recordAppLogout(db, userId, cfg);
    expect(await loggedOutAt(userId)).toEqual(NOW);
  });

  it('アプリ発のシグナル受信でクリアされる（再ログインの証拠）', async () => {
    const subject = await seedSubject(db);
    await recordAppLogout(db, subject, cfg);
    await recordSignal(db, { subjectUserId: subject, kind: 'app_open' }, cfg);
    expect(await loggedOutAt(subject)).toBeNull();
  });

  it('web_checkin ではクリアされない（アプリのログイン状態と無関係）', async () => {
    const subject = await seedSubject(db);
    await recordAppLogout(db, subject, cfg);
    await recordSignal(
      db,
      { subjectUserId: subject, kind: 'web_checkin' },
      cfg,
    );
    expect(await loggedOutAt(subject)).toEqual(NOW);
  });

  it('見守りダッシュボードに appLoggedOutAt が載る', async () => {
    const subject = await seedSubject(db, { lastSignalAt: hoursAgo(2, NOW) });
    const watcher = await seedWatcher(db, subject);
    await recordAppLogout(db, subject, cfg);
    const rows = await getWatcherDashboard(db, watcher);
    expect(rows).toHaveLength(1);
    expect(rows[0].appLoggedOutAt).toEqual(NOW);
  });
});
