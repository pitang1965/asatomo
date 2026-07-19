import { and, eq } from 'drizzle-orm';
import type { Db } from '../db';
import { connections, user } from '../db/schema';
import { type DomainConfig, recomputeDisclosureEnabled } from './monitoring';

/**
 * つながり（connection）のライフサイクル（タスク: 見守り者招待 / 受取人追加）。
 *
 * つながり = 本人が自分のサークルに加えた相手（有向）。見守り役割の有無を isWatcher で載せる。
 * 相互見守りは 2 本のつながりで表現（各本人がそれぞれ相手を招待）。
 *
 * 承諾・取消のたびに開示可否（見守り者2人以上か）を再計算する（不変条件D / ADR-0001）。
 * なふだからの「昇格」も、この inviteWatcher → respondToWatchInvite の明示同意を通す（ADR-0003）。
 */

// ─── 見守りエッジの作成/昇格（共通） ────────────────────────────────────────
/**
 * 見守りエッジ（isWatcher=true）を作る/昇格する共通処理。
 *   - inviteWatcher: status='pending'（相手の承諾待ち）
 *   - 招待リンクの承諾: status='accepted'（承諾者が今まさに同意。ADR-0005）
 * 既に accepted の見守り者なら no-op（冪等）。displayName 未指定なら相手の user.name を使う。
 * accepted で作る時は watcherLastSeenAt/respondedAt を now にする（休眠判定・定足数の起点）。
 */
export async function upsertWatcherConnection(
  db: Db,
  subjectUserId: string,
  watcherUserId: string,
  opts: { status: 'pending' | 'accepted'; displayName?: string; now: Date },
): Promise<
  | { ok: false; reason: 'user_not_found' }
  | {
      ok: true;
      connectionId: string;
      status: 'pending' | 'accepted';
      alreadyAccepted: boolean;
    }
> {
  const { now } = opts;
  const accepted = opts.status === 'accepted';

  let displayName = opts.displayName;
  if (!displayName) {
    const [u] = await db
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, watcherUserId))
      .limit(1);
    if (!u) return { ok: false, reason: 'user_not_found' };
    displayName = u.name;
  }

  const [existing] = await db
    .select({
      id: connections.id,
      status: connections.watcherStatus,
      isWatcher: connections.isWatcher,
    })
    .from(connections)
    .where(
      and(
        eq(connections.subjectUserId, subjectUserId),
        eq(connections.otherUserId, watcherUserId),
      ),
    )
    .limit(1);

  if (existing) {
    // 既に承諾済みの見守り者なら no-op（冪等）。
    if (existing.isWatcher && existing.status === 'accepted')
      return {
        ok: true,
        connectionId: existing.id,
        status: 'accepted',
        alreadyAccepted: true,
      };
    // pending/declined/revoked or 純粋な受取人 → 見守り者へ昇格。
    await db
      .update(connections)
      .set({
        isWatcher: true,
        watcherStatus: opts.status,
        invitedAt: now,
        ...(accepted ? { respondedAt: now, watcherLastSeenAt: now } : {}),
        updatedAt: now,
      })
      .where(eq(connections.id, existing.id));
    return {
      ok: true,
      connectionId: existing.id,
      status: opts.status,
      alreadyAccepted: false,
    };
  }

  const [row] = await db
    .insert(connections)
    .values({
      subjectUserId,
      otherUserId: watcherUserId,
      displayName,
      isWatcher: true,
      watcherStatus: opts.status,
      invitedAt: now,
      ...(accepted ? { respondedAt: now, watcherLastSeenAt: now } : {}),
    })
    .returning({ id: connections.id });
  return {
    ok: true,
    connectionId: row.id,
    status: opts.status,
    alreadyAccepted: false,
  };
}

// ─── 見守り者の招待（isWatcher=true, pending） ──────────────────────────────
export async function inviteWatcher(
  db: Db,
  input: { subjectUserId: string; watcherUserId: string; displayName?: string },
  config: DomainConfig,
): Promise<
  | { ok: false; reason: 'self' | 'user_not_found' }
  | { ok: true; connectionId: string; status: 'pending' | 'accepted' }
> {
  const now = config.now ?? new Date();
  if (input.subjectUserId === input.watcherUserId)
    return { ok: false, reason: 'self' };

  const r = await upsertWatcherConnection(
    db,
    input.subjectUserId,
    input.watcherUserId,
    { status: 'pending', displayName: input.displayName, now },
  );
  if (!r.ok) return { ok: false, reason: r.reason };
  return { ok: true, connectionId: r.connectionId, status: r.status };
}

// ─── 招待への応答（承諾/辞退） ──────────────────────────────────────────────
export async function respondToWatchInvite(
  db: Db,
  input: { subjectUserId: string; watcherUserId: string; accept: boolean },
  config: DomainConfig,
): Promise<
  | { ok: false; reason: 'no_pending_invite' }
  | { ok: true; status: 'accepted' | 'declined'; disclosureEnabled: boolean }
> {
  const now = config.now ?? new Date();
  const upd = await db
    .update(connections)
    .set({
      watcherStatus: input.accept ? 'accepted' : 'declined',
      respondedAt: now,
      watcherLastSeenAt: input.accept ? now : null,
      updatedAt: now,
    })
    .where(
      and(
        eq(connections.subjectUserId, input.subjectUserId),
        eq(connections.otherUserId, input.watcherUserId),
        eq(connections.isWatcher, true),
        eq(connections.watcherStatus, 'pending'),
      ),
    )
    .returning({ id: connections.id });
  if (upd.length === 0) return { ok: false, reason: 'no_pending_invite' };

  // 承諾/辞退どちらでも開示可否を再計算（不変条件D）。
  const disclosure = await recomputeDisclosureEnabled(
    db,
    input.subjectUserId,
    config,
  );
  return {
    ok: true,
    status: input.accept ? 'accepted' : 'declined',
    disclosureEnabled: disclosure.enabled,
  };
}

// ─── 見守り者の取消（辞退・離脱） ───────────────────────────────────────────
export async function revokeWatcher(
  db: Db,
  input: { subjectUserId: string; connectionId: string },
  config: DomainConfig,
): Promise<
  { ok: false; reason: 'not_found' } | { ok: true; disclosureEnabled: boolean }
> {
  const now = config.now ?? new Date();
  const upd = await db
    .update(connections)
    .set({ watcherStatus: 'revoked', updatedAt: now })
    .where(
      and(
        eq(connections.id, input.connectionId),
        eq(connections.subjectUserId, input.subjectUserId),
        eq(connections.isWatcher, true),
      ),
    )
    .returning({ id: connections.id });
  if (upd.length === 0) return { ok: false, reason: 'not_found' };

  // 取消で2人未満に落ちれば自動ロック（不変条件D）。
  const disclosure = await recomputeDisclosureEnabled(
    db,
    input.subjectUserId,
    config,
  );
  return { ok: true, disclosureEnabled: disclosure.enabled };
}

// ─── 純粋な受取人（メールのみ or 見守りでない user）を追加 ───────────────────
//   メッセージの宛先にできる「つながり」を作る。受取人性は宛先指定から派生するため、
//   ここでは isWatcher=false のつながりを用意するだけ。
export async function addContact(
  db: Db,
  input: {
    subjectUserId: string;
    displayName: string;
    email?: string;
    userId?: string;
    passphraseHint?: string;
  },
  config: DomainConfig,
): Promise<
  | { ok: false; reason: 'need_email_xor_user' | 'self' }
  | { ok: true; connectionId: string }
> {
  const now = config.now ?? new Date();
  // 相手はメール or user のどちらか一方（スキーマの CHECK と対応）。
  if ((input.email == null) === (input.userId == null))
    return { ok: false, reason: 'need_email_xor_user' };
  if (input.userId === input.subjectUserId)
    return { ok: false, reason: 'self' };

  // user 相手で既存つながりがあれば重複させず更新。
  if (input.userId) {
    const [existing] = await db
      .select({ id: connections.id })
      .from(connections)
      .where(
        and(
          eq(connections.subjectUserId, input.subjectUserId),
          eq(connections.otherUserId, input.userId),
        ),
      )
      .limit(1);
    if (existing) {
      await db
        .update(connections)
        .set({
          displayName: input.displayName,
          passphraseHint: input.passphraseHint ?? null,
          updatedAt: now,
        })
        .where(eq(connections.id, existing.id));
      return { ok: true, connectionId: existing.id };
    }
  }

  const [row] = await db
    .insert(connections)
    .values({
      subjectUserId: input.subjectUserId,
      otherUserId: input.userId ?? null,
      externalEmail: input.email ?? null,
      displayName: input.displayName,
      isWatcher: false,
      passphraseHint: input.passphraseHint ?? null,
    })
    .returning({ id: connections.id });
  return { ok: true, connectionId: row.id };
}

// ─── 受取人ごとの合言葉ヒント設定（ADR-0002。合言葉自体は保存しない） ─────────
export async function setPassphraseHint(
  db: Db,
  input: { subjectUserId: string; connectionId: string; hint: string | null },
  config: DomainConfig,
): Promise<{ ok: boolean; reason?: 'not_found' }> {
  const now = config.now ?? new Date();
  const upd = await db
    .update(connections)
    .set({ passphraseHint: input.hint, updatedAt: now })
    .where(
      and(
        eq(connections.id, input.connectionId),
        eq(connections.subjectUserId, input.subjectUserId),
      ),
    )
    .returning({ id: connections.id });
  return upd.length > 0 ? { ok: true } : { ok: false, reason: 'not_found' };
}
