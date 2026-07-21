import { beforeEach, describe, expect, it } from 'vitest';
import { createHandlers } from '../src/api/handlers';
import type { Db } from '../src/db';
import { addContact } from '../src/domain/connections';
import { DEFAULT_DOMAIN_CONFIG } from '../src/domain/monitoring';
import type { Notifications, WatcherEvent } from '../src/notify/notifier';
import {
  hoursAgo,
  makeTestDb,
  seedCertification,
  seedSubject,
  seedUser,
  seedWatcher,
} from './helpers';

const NOW = new Date('2026-07-14T12:00:00Z');

let db: Db;
beforeEach(async () => {
  db = await makeTestDb();
});

function makeCtx() {
  const calls = {
    watchers: [] as { id: string; event: WatcherEvent }[],
    invites: [] as { id: string; invitee: string }[],
    locked: [] as string[],
  };
  const notify = {
    async notifySubjectUnresponsive() {},
    async notifyWatchersAlert() {},
    async discloseMessages() {},
    async notifyOperatorDegraded() {},
    async notifyWatchers(id: string, event: WatcherEvent) {
      calls.watchers.push({ id, event });
    },
    async notifySubjectDisclosureLocked(id: string) {
      calls.locked.push(id);
    },
    async notifySubjectWatcherLeft() {},
    async notifyWatchInvite(id: string, invitee: string) {
      calls.invites.push({ id, invitee });
    },
  } satisfies Notifications;
  const ctx = { db, notify, config: { ...DEFAULT_DOMAIN_CONFIG, now: NOW } };
  return { handlers: createHandlers(ctx), calls };
}

const content = {
  encryptedLabel: 'bA==',
  ciphertext: 'Yw==',
  iv: 'aXY=',
  authorWrappedDek: 'YXdk',
};

describe('本人アクション', () => {
  it('signal: 進行中エピソードをキャンセル', async () => {
    const s = await seedSubject(db, { state: 'voting' });
    await seedWatcher(db, s);
    await seedCertification(db, s, { stage: 'voting' });
    const { handlers } = makeCtx();
    const r = await handlers.signal(s, { kind: 'meal' });
    expect(r).toEqual({
      ok: true,
      data: { cancelledEpisode: true, stale: false, youAreWatched: true },
    });
  });

  it('signal: youAreWatched は承諾済み見守り者の有無を返す', async () => {
    const { handlers } = makeCtx();
    // 見守り者あり: true。
    const watched = await seedSubject(db);
    await seedWatcher(db, watched);
    const a = await handlers.signal(watched, { kind: 'app_open' });
    expect(a.ok && a.data.youAreWatched).toBe(true);
    // 見守り者なし（監視行はあるが承諾済み見守り者ゼロ）: false。
    const lonely = await seedSubject(db);
    const b = await handlers.signal(lonely, { kind: 'app_open' });
    expect(b.ok && b.data.youAreWatched).toBe(false);
  });

  it('watchOverview: youAreWatched を含む', async () => {
    const { handlers } = makeCtx();
    const watched = await seedSubject(db);
    await seedWatcher(db, watched);
    const r1 = await handlers.watchOverview(watched);
    expect(r1.ok && r1.data.youAreWatched).toBe(true);

    const lonely = await seedSubject(db);
    const r2 = await handlers.watchOverview(lonely);
    expect(r2.ok && r2.data.youAreWatched).toBe(false);
  });

  it('travel: 有効な期間はOK、上限超過は400', async () => {
    const s = await seedSubject(db);
    const { handlers } = makeCtx();
    const ok = await handlers.setTravel(s, {
      until: new Date(NOW.getTime() + 5 * 86_400_000),
    });
    expect(ok.ok).toBe(true);
    const tooLong = await handlers.setTravel(s, {
      until: new Date(NOW.getTime() + 40 * 86_400_000),
    });
    expect(tooLong).toEqual({ ok: false, status: 400, error: 'too_long' });
  });

  it('cancelDisclosure: 猶予中でなければ409', async () => {
    const s = await seedSubject(db, { state: 'voting' });
    await seedCertification(db, s, { stage: 'voting' });
    const { handlers } = makeCtx();
    const r = await handlers.cancelDisclosure(s);
    expect(r).toEqual({ ok: false, status: 409, error: 'not_in_grace' });
  });
});

describe('見守り者アクション + 通知発火', () => {
  async function alerted() {
    const s = await seedSubject(db, { state: 'watchers_alerted' });
    await seedCertification(db, s, {
      stage: 'watchers_alerted',
      startedAt: hoursAgo(48, NOW),
    });
    const w = await seedWatcher(db, s);
    return { s, w };
  }

  it('vote: 見守り者でなければ403', async () => {
    const { s } = await alerted();
    const { handlers } = makeCtx();
    const r = await handlers.vote('stranger', { subjectUserId: s });
    expect(r).toEqual({ ok: false, status: 403, error: 'not_a_watcher' });
  });

  it('vote: 最初の1票で投票要請通知が飛ぶ', async () => {
    const { s, w } = await alerted();
    const { handlers, calls } = makeCtx();
    const r = await handlers.vote(w, { subjectUserId: s });
    expect(r).toEqual({ ok: true, data: { certified: false } });
    expect(calls.watchers).toEqual([{ id: s, event: 'vote_requested' }]);
  });

  it('attest: 解決し、代理確認通知が飛ぶ', async () => {
    const { s, w } = await alerted();
    const { handlers, calls } = makeCtx();
    const r = await handlers.attest(w, { subjectUserId: s, note: '電話した' });
    expect(r).toEqual({ ok: true, data: { resolved: true } });
    expect(calls.watchers).toEqual([{ id: s, event: 'attestation' }]);
  });
});

describe('受取人の懸念フラグ', () => {
  it('つながりでない者は403', async () => {
    const s = await seedSubject(db);
    const { handlers } = makeCtx();
    const r = await handlers.raiseConcern('stranger', { subjectUserId: s });
    expect(r).toEqual({ ok: false, status: 403, error: 'not_a_connection' });
  });

  it('受取人が上げると懸念通知が飛ぶ', async () => {
    const s = await seedSubject(db);
    const u = await seedUser(db, 'recipient');
    await addContact(
      db,
      { subjectUserId: s, userId: u, displayName: 'R' },
      { ...DEFAULT_DOMAIN_CONFIG, now: NOW },
    );
    const { handlers, calls } = makeCtx();
    const r = await handlers.raiseConcern(u, {
      subjectUserId: s,
      note: '不在',
    });
    expect(r.ok).toBe(true);
    expect(calls.watchers).toEqual([{ id: s, event: 'concern' }]);
  });
});

describe('つながり管理', () => {
  it('inviteWatcher: 招待通知が飛ぶ', async () => {
    const s = await seedSubject(db);
    const w = await seedUser(db, 'invitee');
    const { handlers, calls } = makeCtx();
    const r = await handlers.inviteWatcher(s, { watcherUserId: w });
    expect(r.ok).toBe(true);
    expect(calls.invites).toEqual([{ id: s, invitee: w }]);
  });
});

describe('メッセージの本人所有', () => {
  it('作成できる / 他人は編集できない(404)', async () => {
    const s = await seedSubject(db);
    const other = await seedSubject(db);
    const { handlers } = makeCtx();

    const created = await handlers.createMessage(s, {
      ...content,
      recipients: [],
    });
    expect(created.ok).toBe(true);
    const messageId = created.ok
      ? (created.data as { messageId: string }).messageId
      : '';

    const foreign = await handlers.updateMessage(other, {
      messageId,
      ciphertext: 'eA==',
    });
    expect(foreign).toEqual({ ok: false, status: 404, error: 'not_found' });
  });
});
