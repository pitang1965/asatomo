import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db';
import * as schema from '../src/db/schema';
import { addContact } from '../src/domain/connections';
import {
  acceptInvitation,
  createInvitation,
  getInvitationPreview,
  revokeInvitation,
} from '../src/domain/invitations';
import { DEFAULT_DOMAIN_CONFIG } from '../src/domain/monitoring';
import { makeTestDb, seedSubject, seedUser } from './helpers';

const NOW = new Date('2026-07-14T12:00:00Z');
const DAY_MS = 86_400_000;
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

describe('招待の作成とプレビュー', () => {
  it('作成でトークンと期限（now+7日）を返し、プレビューが有効', async () => {
    const inviter = await seedSubject(db);
    const { token, expiresAt } = await createInvitation(
      db,
      { inviterUserId: inviter },
      cfg,
    );
    expect(token.length).toBeGreaterThan(10);
    expect(expiresAt.getTime()).toBe(NOW.getTime() + 7 * DAY_MS);

    const preview = await getInvitationPreview(db, token, NOW);
    expect(preview).toMatchObject({ valid: true, inviterUserId: inviter });
  });

  it('存在しないトークンは not_found', async () => {
    const preview = await getInvitationPreview(db, 'nope', NOW);
    expect(preview).toEqual({ valid: false, reason: 'not_found' });
  });
});

describe('招待の承諾', () => {
  it('相互承諾で双方向2本が accepted になり、招待は使い切られる', async () => {
    const inviter = await seedSubject(db);
    const accepter = await seedUser(db, 'accepter');
    const { token } = await createInvitation(
      db,
      { inviterUserId: inviter },
      cfg,
    );

    const res = await acceptInvitation(
      db,
      { token, accepterUserId: accepter, mutual: true },
      cfg,
    );
    expect(res).toMatchObject({
      ok: true,
      mutual: true,
      inviterUserId: inviter,
    });

    // 招待者 → 承諾者（承諾者が招待者を見守る）
    expect((await connOf(inviter, accepter))?.watcherStatus).toBe('accepted');
    // 承諾者 → 招待者（相互）
    expect((await connOf(accepter, inviter))?.watcherStatus).toBe('accepted');

    // 使い切り: 二度目は consumed
    const again = await acceptInvitation(
      db,
      { token, accepterUserId: accepter, mutual: true },
      cfg,
    );
    expect(again).toEqual({ ok: false, reason: 'consumed' });
  });

  it('片務承諾（mutual=false）は招待者側の1本だけ作る', async () => {
    const inviter = await seedSubject(db);
    const accepter = await seedUser(db, 'accepter');
    const { token } = await createInvitation(
      db,
      { inviterUserId: inviter },
      cfg,
    );

    await acceptInvitation(
      db,
      { token, accepterUserId: accepter, mutual: false },
      cfg,
    );
    expect((await connOf(inviter, accepter))?.watcherStatus).toBe('accepted');
    expect(await connOf(accepter, inviter)).toBeUndefined();
  });

  it('自分自身の招待は承諾できず、消費もされない', async () => {
    const inviter = await seedSubject(db);
    const { token } = await createInvitation(
      db,
      { inviterUserId: inviter },
      cfg,
    );

    const selfRes = await acceptInvitation(
      db,
      { token, accepterUserId: inviter, mutual: true },
      cfg,
    );
    expect(selfRes).toEqual({ ok: false, reason: 'self' });

    // 消費されていないので、別人はまだ承諾できる。
    const other = await seedUser(db, 'other');
    const ok = await acceptInvitation(
      db,
      { token, accepterUserId: other, mutual: true },
      cfg,
    );
    expect(ok.ok).toBe(true);
  });

  it('期限切れは expired', async () => {
    const inviter = await seedSubject(db);
    const accepter = await seedUser(db, 'accepter');
    const { token } = await createInvitation(
      db,
      { inviterUserId: inviter },
      cfg,
    );

    const later = { ...cfg, now: new Date(NOW.getTime() + 8 * DAY_MS) };
    const res = await acceptInvitation(
      db,
      { token, accepterUserId: accepter, mutual: true },
      later,
    );
    expect(res).toEqual({ ok: false, reason: 'expired' });
  });

  it('純粋な受取人だった相手を承諾で見守り者へ昇格', async () => {
    const inviter = await seedSubject(db);
    const friend = await seedUser(db, 'friend');
    // 先に受取人（isWatcher=false）として存在させる
    await addContact(
      db,
      { subjectUserId: inviter, userId: friend, displayName: '友人' },
      cfg,
    );
    expect((await connOf(inviter, friend))?.isWatcher).toBe(false);

    const { token } = await createInvitation(
      db,
      { inviterUserId: inviter },
      cfg,
    );
    await acceptInvitation(
      db,
      { token, accepterUserId: friend, mutual: false },
      cfg,
    );

    const conn = await connOf(inviter, friend);
    expect(conn?.isWatcher).toBe(true);
    expect(conn?.watcherStatus).toBe('accepted');
  });

  it('2人が承諾すると招待者の開示が有効化（不変条件D）', async () => {
    const inviter = await seedSubject(db);
    const a1 = await seedUser(db, 'a1');
    const a2 = await seedUser(db, 'a2');

    const inv1 = await createInvitation(db, { inviterUserId: inviter }, cfg);
    const first = await acceptInvitation(
      db,
      { token: inv1.token, accepterUserId: a1, mutual: false },
      cfg,
    );
    expect(first).toMatchObject({ ok: true, inviterDisclosureLocked: true });
    expect(await disclosureEnabled(inviter)).toBe(false);

    const inv2 = await createInvitation(db, { inviterUserId: inviter }, cfg);
    const second = await acceptInvitation(
      db,
      { token: inv2.token, accepterUserId: a2, mutual: false },
      cfg,
    );
    expect(second).toMatchObject({ ok: true, inviterDisclosureLocked: false });
    expect(await disclosureEnabled(inviter)).toBe(true);
  });
});

describe('招待の取消', () => {
  it('招待者が取り消すと承諾できず revoked、他人の取消は not_found', async () => {
    const inviter = await seedSubject(db);
    const accepter = await seedUser(db, 'accepter');
    const stranger = await seedUser(db, 'stranger');
    const { token } = await createInvitation(
      db,
      { inviterUserId: inviter },
      cfg,
    );

    // 他人は取り消せない
    const notOwner = await revokeInvitation(
      db,
      { inviterUserId: stranger, token },
      cfg,
    );
    expect(notOwner).toEqual({ ok: false, reason: 'not_found' });

    const rev = await revokeInvitation(
      db,
      { inviterUserId: inviter, token },
      cfg,
    );
    expect(rev).toEqual({ ok: true });

    const res = await acceptInvitation(
      db,
      { token, accepterUserId: accepter, mutual: true },
      cfg,
    );
    expect(res).toEqual({ ok: false, reason: 'revoked' });
  });
});
