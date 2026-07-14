import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db';
import * as schema from '../src/db/schema';
import {
  addContact,
  inviteWatcher,
  respondToWatchInvite,
  revokeWatcher,
  setPassphraseHint,
} from '../src/domain/connections';
import { DEFAULT_DOMAIN_CONFIG } from '../src/domain/monitoring';
import { makeTestDb, seedSubject, seedUser } from './helpers';

const NOW = new Date('2026-07-14T12:00:00Z');
const cfg = { ...DEFAULT_DOMAIN_CONFIG, now: NOW };

let db: Db;
beforeEach(async () => {
  db = await makeTestDb();
});

async function connOf(subjectUserId: string, otherUserId: string) {
  const [r] = await db
    .select()
    .from(schema.connections)
    .where(
      and(
        eq(schema.connections.subjectUserId, subjectUserId),
        eq(schema.connections.otherUserId, otherUserId),
      ),
    )
    .limit(1);
  return r;
}

async function disclosureEnabled(subjectUserId: string) {
  const [r] = await db
    .select({ v: schema.subjectSettings.disclosureEnabled })
    .from(schema.subjectSettings)
    .where(eq(schema.subjectSettings.userId, subjectUserId))
    .limit(1);
  return r?.v;
}

describe('見守り者の招待ライフサイクル', () => {
  it('招待 → pending、承諾 → accepted', async () => {
    const s = await seedSubject(db);
    const w = await seedUser(db, 'watcher');

    const inv = await inviteWatcher(
      db,
      { subjectUserId: s, watcherUserId: w },
      cfg,
    );
    expect(inv).toMatchObject({ ok: true, status: 'pending' });
    expect((await connOf(s, w))?.watcherStatus).toBe('pending');

    const res = await respondToWatchInvite(
      db,
      { subjectUserId: s, watcherUserId: w, accept: true },
      cfg,
    );
    expect(res).toMatchObject({ ok: true, status: 'accepted' });
    const conn = await connOf(s, w);
    expect(conn?.watcherStatus).toBe('accepted');
    expect(conn?.watcherLastSeenAt?.getTime()).toBe(NOW.getTime());
  });

  it('自分自身は招待できない', async () => {
    const s = await seedSubject(db);
    const inv = await inviteWatcher(
      db,
      { subjectUserId: s, watcherUserId: s },
      cfg,
    );
    expect(inv).toEqual({ ok: false, reason: 'self' });
  });

  it('存在しない user は招待できない', async () => {
    const s = await seedSubject(db);
    const inv = await inviteWatcher(
      db,
      { subjectUserId: s, watcherUserId: 'ghost' },
      cfg,
    );
    expect(inv).toEqual({ ok: false, reason: 'user_not_found' });
  });

  it('辞退 → declined、承諾済みの再招待は無効(no-op)', async () => {
    const s = await seedSubject(db);
    const w = await seedUser(db, 'watcher');
    await inviteWatcher(db, { subjectUserId: s, watcherUserId: w }, cfg);

    const dec = await respondToWatchInvite(
      db,
      { subjectUserId: s, watcherUserId: w, accept: false },
      cfg,
    );
    expect(dec).toMatchObject({ ok: true, status: 'declined' });

    // pending が無いので再応答は失敗。
    const again = await respondToWatchInvite(
      db,
      { subjectUserId: s, watcherUserId: w, accept: true },
      cfg,
    );
    expect(again).toEqual({ ok: false, reason: 'no_pending_invite' });
  });

  it('純粋な受取人を見守り者へ昇格できる', async () => {
    const s = await seedSubject(db);
    const u = await seedUser(db, 'friend');
    // まず受取人として追加（isWatcher=false）
    await addContact(
      db,
      { subjectUserId: s, userId: u, displayName: '友人' },
      cfg,
    );
    expect((await connOf(s, u))?.isWatcher).toBe(false);

    // 昇格（ADR-0003 の明示同意フロー）
    const inv = await inviteWatcher(
      db,
      { subjectUserId: s, watcherUserId: u },
      cfg,
    );
    expect(inv).toMatchObject({ ok: true, status: 'pending' });
    const conn = await connOf(s, u);
    expect(conn?.isWatcher).toBe(true);
    expect(conn?.watcherStatus).toBe('pending');
  });
});

describe('不変条件D: 承諾/取消で開示可否が連動', () => {
  it('2人承諾で有効、1人取消で無効へ', async () => {
    const s = await seedSubject(db);
    const w1 = await seedUser(db, 'w1');
    const w2 = await seedUser(db, 'w2');
    await inviteWatcher(db, { subjectUserId: s, watcherUserId: w1 }, cfg);
    await inviteWatcher(db, { subjectUserId: s, watcherUserId: w2 }, cfg);

    await respondToWatchInvite(
      db,
      { subjectUserId: s, watcherUserId: w1, accept: true },
      cfg,
    );
    const second = await respondToWatchInvite(
      db,
      { subjectUserId: s, watcherUserId: w2, accept: true },
      cfg,
    );
    expect(second).toMatchObject({ ok: true, disclosureEnabled: true });
    expect(await disclosureEnabled(s)).toBe(true);

    // 1人取消 → 1人になり無効化。
    const conn2 = await connOf(s, w2);
    if (!conn2) throw new Error('conn2 missing');
    const rev = await revokeWatcher(
      db,
      { subjectUserId: s, connectionId: conn2.id },
      cfg,
    );
    expect(rev).toMatchObject({ ok: true, disclosureEnabled: false });
    expect(await disclosureEnabled(s)).toBe(false);
  });

  it('1人承諾だけでは無効のまま', async () => {
    const s = await seedSubject(db);
    const w1 = await seedUser(db, 'w1');
    await inviteWatcher(db, { subjectUserId: s, watcherUserId: w1 }, cfg);
    const res = await respondToWatchInvite(
      db,
      { subjectUserId: s, watcherUserId: w1, accept: true },
      cfg,
    );
    expect(res).toMatchObject({ ok: true, disclosureEnabled: false });
  });

  it('存在しないつながりの取消は失敗', async () => {
    const s = await seedSubject(db);
    const rev = await revokeWatcher(
      db,
      {
        subjectUserId: s,
        connectionId: '00000000-0000-0000-0000-000000000000',
      },
      cfg,
    );
    expect(rev).toEqual({ ok: false, reason: 'not_found' });
  });
});

describe('受取人（つながり）の追加', () => {
  it('メールだけの受取人を追加できる（アカウント不要・isWatcher=false）', async () => {
    const s = await seedSubject(db);
    const r = await addContact(
      db,
      {
        subjectUserId: s,
        email: 'mother@example.test',
        displayName: '母',
        passphraseHint: '最初に飼った犬の名前',
      },
      cfg,
    );
    expect(r.ok).toBe(true);
    const [row] = await db
      .select()
      .from(schema.connections)
      .where(eq(schema.connections.subjectUserId, s))
      .limit(1);
    expect(row?.isWatcher).toBe(false);
    expect(row?.externalEmail).toBe('mother@example.test');
    expect(row?.passphraseHint).toBe('最初に飼った犬の名前');
  });

  it('メールとuserの両方指定はエラー', async () => {
    const s = await seedSubject(db);
    const u = await seedUser(db);
    const r = await addContact(
      db,
      {
        subjectUserId: s,
        email: 'x@example.test',
        userId: u,
        displayName: 'x',
      },
      cfg,
    );
    expect(r).toEqual({ ok: false, reason: 'need_email_xor_user' });
  });

  it('どちらも未指定はエラー', async () => {
    const s = await seedSubject(db);
    const r = await addContact(db, { subjectUserId: s, displayName: 'x' }, cfg);
    expect(r).toEqual({ ok: false, reason: 'need_email_xor_user' });
  });

  it('合言葉ヒントを更新できる', async () => {
    const s = await seedSubject(db);
    const add = await addContact(
      db,
      { subjectUserId: s, email: 'a@example.test', displayName: 'A' },
      cfg,
    );
    if (!add.ok) throw new Error('setup failed');
    const r = await setPassphraseHint(
      db,
      {
        subjectUserId: s,
        connectionId: add.connectionId,
        hint: '合言葉のヒント',
      },
      cfg,
    );
    expect(r.ok).toBe(true);
  });
});
