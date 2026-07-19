import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Db } from '../db';
import { invitations, subjectSettings, user } from '../db/schema';
import { upsertWatcherConnection } from './connections';
import { type DomainConfig, recomputeDisclosureEnabled } from './monitoring';

/**
 * 招待（Invitation）のライフサイクル（ADR-0005）。
 *
 * 招待 = まだ相手が確定していない「開いた申し出」。トークン付きリンクで送り、承諾で
 * connections（相互見守りなら双方向2本）へ昇格する。使い切り・期限付き・取消可。
 *
 * 方針: ドメインは DB 操作のみ（純粋・テスト可能）。通知はせず、必要な意図を結果で返す
 * （ルート層が Notifier を叩く。monitoring/connections と対称）。
 */

const DAY_MS = 86_400_000;
const DEFAULT_INVITE_TTL_DAYS = 7;

/** URLセーフ乱数トークン（16バイト→base64url, ~22文字）。Workers/Node/pglite 共通の globalThis.crypto。 */
function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export type InvitationInvalidReason =
  | 'not_found'
  | 'expired'
  | 'consumed'
  | 'revoked';

// ─── 作成（招待者＝見守り者が欲しい本人） ───────────────────────────────────
export async function createInvitation(
  db: Db,
  input: { inviterUserId: string },
  config: DomainConfig,
): Promise<{ token: string; expiresAt: Date }> {
  const now = config.now ?? new Date();
  const ttlDays = config.inviteTtlDays ?? DEFAULT_INVITE_TTL_DAYS;
  const expiresAt = new Date(now.getTime() + ttlDays * DAY_MS);
  const token = generateToken();
  await db.insert(invitations).values({
    token,
    inviterUserId: input.inviterUserId,
    expiresAt,
    createdAt: now,
  });
  return { token, expiresAt };
}

// ─── プレビュー（承諾ランディングの表示用・読み取り専用） ────────────────────
export async function getInvitationPreview(
  db: Db,
  token: string,
  now: Date,
): Promise<
  | { valid: false; reason: InvitationInvalidReason }
  | { valid: true; inviterUserId: string; inviterName: string }
> {
  const [inv] = await db
    .select({
      inviterUserId: invitations.inviterUserId,
      inviterName: user.name,
      expiresAt: invitations.expiresAt,
      consumedAt: invitations.consumedAt,
      revokedAt: invitations.revokedAt,
    })
    .from(invitations)
    .innerJoin(user, eq(invitations.inviterUserId, user.id))
    .where(eq(invitations.token, token))
    .limit(1);
  if (!inv) return { valid: false, reason: 'not_found' };
  if (inv.revokedAt) return { valid: false, reason: 'revoked' };
  if (inv.consumedAt) return { valid: false, reason: 'consumed' };
  if (inv.expiresAt <= now) return { valid: false, reason: 'expired' };
  return {
    valid: true,
    inviterUserId: inv.inviterUserId,
    inviterName: inv.inviterName,
  };
}

// ─── 承諾（承諾者がリンクを踏んでログイン後に呼ぶ） ──────────────────────────
export type AcceptResult =
  | { ok: false; reason: InvitationInvalidReason | 'self' }
  | {
      ok: true;
      mutual: boolean;
      inviterUserId: string;
      /** 招待者が承諾後も見守り者2人未満（開示ロック）なら true → ルート層が本人へ通知。 */
      inviterDisclosureLocked: boolean;
    };

export async function acceptInvitation(
  db: Db,
  input: { token: string; accepterUserId: string; mutual: boolean },
  config: DomainConfig,
): Promise<AcceptResult> {
  const now = config.now ?? new Date();

  // self は消費前に弾く（誤消費を残さない）。
  const preview = await getInvitationPreview(db, input.token, now);
  if (!preview.valid) return { ok: false, reason: preview.reason };
  if (preview.inviterUserId === input.accepterUserId)
    return { ok: false, reason: 'self' };

  // 使い切りの原子的消費: 未消費・未取消・未失効の招待だけをこの承諾で消費する。
  // RETURNING で「今回自分が消費できたか」を判定（並行の二重承諾は 0 件で安全に空振り）。
  const [claimed] = await db
    .update(invitations)
    .set({ consumedAt: now, consumedByUserId: input.accepterUserId })
    .where(
      and(
        eq(invitations.token, input.token),
        isNull(invitations.consumedAt),
        isNull(invitations.revokedAt),
        gt(invitations.expiresAt, now),
      ),
    )
    .returning({ inviterUserId: invitations.inviterUserId });
  if (!claimed) {
    const p2 = await getInvitationPreview(db, input.token, now);
    return { ok: false, reason: p2.valid ? 'consumed' : p2.reason };
  }
  const inviterUserId = claimed.inviterUserId;

  // 承諾者 → 招待者（承諾者が招待者を見守る）。承諾者は今まさに同意 → accepted。
  await ensureSubjectSettings(db, inviterUserId);
  await upsertWatcherConnection(db, inviterUserId, input.accepterUserId, {
    status: 'accepted',
    now,
  });

  // 相互: 招待者 → 承諾者（招待者は「見守り合い」作成時に同意済み → accepted）。
  if (input.mutual) {
    await ensureSubjectSettings(db, input.accepterUserId);
    await upsertWatcherConnection(db, input.accepterUserId, inviterUserId, {
      status: 'accepted',
      now,
    });
    await recomputeDisclosureEnabled(db, input.accepterUserId, config);
  }

  const inviterDisclosure = await recomputeDisclosureEnabled(
    db,
    inviterUserId,
    config,
  );
  return {
    ok: true,
    mutual: input.mutual,
    inviterUserId,
    inviterDisclosureLocked: !inviterDisclosure.enabled,
  };
}

// ─── 取消（招待者のみ・未消費のみ） ─────────────────────────────────────────
export async function revokeInvitation(
  db: Db,
  input: { inviterUserId: string; token: string },
  config: DomainConfig,
): Promise<{ ok: boolean; reason?: 'not_found' }> {
  const now = config.now ?? new Date();
  const upd = await db
    .update(invitations)
    .set({ revokedAt: now })
    .where(
      and(
        eq(invitations.token, input.token),
        eq(invitations.inviterUserId, input.inviterUserId),
        isNull(invitations.consumedAt),
        isNull(invitations.revokedAt),
      ),
    )
    .returning({ id: invitations.id });
  return upd.length > 0 ? { ok: true } : { ok: false, reason: 'not_found' };
}

// ─── ヘルパ ─────────────────────────────────────────────────────────────────

/** 相手が本人（被見守り）になった時に監視行を用意（無ければ作る。既存はそのまま）。 */
async function ensureSubjectSettings(db: Db, userId: string): Promise<void> {
  await db.insert(subjectSettings).values({ userId }).onConflictDoNothing();
}
