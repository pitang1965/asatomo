import { beforeEach, describe, expect, it } from 'vitest';
import { createHandlers } from '../src/api/handlers';
import { dispatch } from '../src/api/router';
import { devActorFromHeader } from '../src/api/session';
import type { Db } from '../src/db';
import { DEFAULT_DOMAIN_CONFIG } from '../src/domain/monitoring';
import type { Notifications } from '../src/notify/notifier';
import { makeTestDb, seedSubject, seedUser } from './helpers';

const NOW = new Date('2026-07-14T12:00:00Z');

const inviteAcceptedCalls: {
  inviter: string;
  accepter: string;
  mutual: boolean;
}[] = [];

const notify = {
  async notifySubjectUnresponsive() {},
  async notifyWatchersAlert() {},
  async discloseMessages() {},
  async notifyOperatorDegraded() {},
  async notifyWatchers() {},
  async notifySubjectDisclosureLocked() {},
  async notifySubjectWatcherLeft() {},
  async notifyWatchInvite() {},
  async notifyInviteAccepted(inviter, accepter, mutual) {
    inviteAcceptedCalls.push({ inviter, accepter, mutual });
  },
} satisfies Notifications;

let db: Db;
let handlers: ReturnType<typeof createHandlers>;
beforeEach(async () => {
  db = await makeTestDb();
  inviteAcceptedCalls.length = 0;
  handlers = createHandlers({
    db,
    notify,
    config: { ...DEFAULT_DOMAIN_CONFIG, now: NOW },
  });
});

describe('router dispatch（検証・認可・写像）', () => {
  it('未知ルートは404、未認証は401', async () => {
    const nf = await dispatch(handlers, 'GET', '/nope', 'u1', {});
    expect(nf.status).toBe(404);
    const un = await dispatch(handlers, 'POST', '/signals', null, {
      kind: 'meal',
    });
    expect(un.status).toBe(401);
  });

  it('正しい入力は200', async () => {
    const s = await seedSubject(db);
    const res = await dispatch(handlers, 'POST', '/signals', s, {
      kind: 'meal',
    });
    expect(res.status).toBe(200);
  });

  it('不正な種別は400', async () => {
    const s = await seedSubject(db);
    const res = await dispatch(handlers, 'POST', '/signals', s, {
      kind: 'bogus',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_input');
  });

  it('JSONの文字列日付を Date に変換して受け付ける', async () => {
    const s = await seedSubject(db);
    const until = new Date(NOW.getTime() + 5 * 86_400_000).toISOString();
    const res = await dispatch(handlers, 'POST', '/travel', s, { until });
    expect(res.status).toBe(200);
  });

  it('日付にならない文字列は400', async () => {
    const s = await seedSubject(db);
    const res = await dispatch(handlers, 'POST', '/travel', s, {
      until: 'not-a-date',
    });
    expect(res.status).toBe(400);
  });

  it('ドメインのエラーはステータスに写像（猶予外の取消=409）', async () => {
    const s = await seedSubject(db, { state: 'normal' });
    const res = await dispatch(handlers, 'POST', '/disclosure/cancel', s, {});
    expect(res.status).toBe(409);
  });
});

describe('招待ルート（ADR-0005）', () => {
  it('作成→承諾が結線され、招待者へ通知が飛ぶ', async () => {
    const inviter = await seedSubject(db);
    const accepter = await seedUser(db, 'accepter');

    const created = await dispatch(
      handlers,
      'POST',
      '/invitations',
      inviter,
      {},
    );
    expect(created.status).toBe(200);
    const { token } = (await created.json()) as { token: string };
    expect(token.length).toBeGreaterThan(10);

    const accepted = await dispatch(
      handlers,
      'POST',
      '/invitations/accept',
      accepter,
      { token, mutual: true },
    );
    expect(accepted.status).toBe(200);
    expect(inviteAcceptedCalls).toEqual([{ inviter, accepter, mutual: true }]);
  });

  it('存在しないトークンの承諾は404、使用済みは409', async () => {
    const inviter = await seedSubject(db);
    const a1 = await seedUser(db, 'a1');
    const a2 = await seedUser(db, 'a2');

    const nf = await dispatch(handlers, 'POST', '/invitations/accept', a1, {
      token: 'ghost',
      mutual: false,
    });
    expect(nf.status).toBe(404);

    const created = await dispatch(
      handlers,
      'POST',
      '/invitations',
      inviter,
      {},
    );
    const { token } = (await created.json()) as { token: string };
    await dispatch(handlers, 'POST', '/invitations/accept', a1, {
      token,
      mutual: false,
    });
    // 使い切り: 二人目は409
    const again = await dispatch(handlers, 'POST', '/invitations/accept', a2, {
      token,
      mutual: false,
    });
    expect(again.status).toBe(409);
  });
});

describe('開発用認証バイパス（devActorFromHeader）', () => {
  it('secret 一致で userId を返す（userId に : を含んでもよい）', () => {
    expect(devActorFromHeader('Bearer s3cret:user-1', 's3cret')).toBe('user-1');
    expect(devActorFromHeader('Bearer s3cret:a:b', 's3cret')).toBe('a:b');
  });

  it('secret 未設定・不一致・形式不正は null（経路が存在しない）', () => {
    expect(devActorFromHeader('Bearer s3cret:user-1', undefined)).toBeNull();
    expect(devActorFromHeader('Bearer s3cret:user-1', '')).toBeNull();
    expect(devActorFromHeader('Bearer wrong:user-1', 's3cret')).toBeNull();
    expect(devActorFromHeader('Bearer s3cretuser-1', 's3cret')).toBeNull();
    expect(devActorFromHeader(null, 's3cret')).toBeNull();
  });
});
