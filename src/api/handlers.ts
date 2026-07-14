import { and, eq } from 'drizzle-orm';
import { connections, subjectSettings } from '../db/schema';
import {
  addContact,
  inviteWatcher,
  respondToWatchInvite,
  revokeWatcher,
  setPassphraseHint,
} from '../domain/connections';
import {
  createMessage,
  deleteMessage,
  type EncryptedContent,
  listMessages,
  type RecipientWrap,
  setMessageRecipients,
  updateMessage,
} from '../domain/messages';
import {
  attest,
  cancelBySubject,
  castVote,
  clearTravelMode,
  raiseConcern,
  recordSignal,
  type SignalKind,
  setTravelMode,
  withdrawVote,
} from '../domain/monitoring';
import { type ApiContext, type ApiResult, safe } from './context';

/**
 * API ハンドラ層（コントローラ）。各ハンドラは「認可 → ドメイン呼び出し → 通知発火 →
 * 結果返却」を担う。actorUserId は認証済みユーザー（session から解決）。
 *
 * 認可モデル:
 *   - 本人所有アクション（signal/travel/message/invite/revoke/…）: subject = actor。
 *   - 見守り者アクション（vote/attest/respond）: input.subjectUserId に対し actor が
 *     承諾済み見守り者か（ドメイン側で検証）。
 *   - 受取人アクション（concern）: actor が subject のつながりか（ここで解決）。
 */
export function createHandlers(ctx: ApiContext) {
  const { db, notify, config } = ctx;

  return {
    // ── 本人（本人側アプリ） ──
    async signal(
      actor: string,
      input: { kind: SignalKind; occurredAt?: Date },
    ): Promise<ApiResult<{ cancelledEpisode: boolean }>> {
      const r = await recordSignal(
        db,
        {
          subjectUserId: actor,
          kind: input.kind,
          occurredAt: input.occurredAt,
        },
        config,
      );
      return { ok: true, data: { cancelledEpisode: r.cancelledEpisode } };
    },

    async setTravel(
      actor: string,
      input: { until: Date },
    ): Promise<ApiResult<{ until: Date }>> {
      const r = await setTravelMode(
        db,
        { subjectUserId: actor, until: input.until },
        config,
      );
      if (!r.ok) return { ok: false, status: 400, error: r.reason };
      return { ok: true, data: { until: r.until } };
    },

    async clearTravel(
      actor: string,
    ): Promise<ApiResult<Record<string, never>>> {
      await clearTravelMode(db, actor, config);
      return { ok: true, data: {} };
    },

    async cancelDisclosure(
      actor: string,
    ): Promise<ApiResult<Record<string, never>>> {
      const r = await cancelBySubject(db, actor, config);
      if (!r.ok) return { ok: false, status: 409, error: r.reason ?? 'error' };
      return { ok: true, data: {} };
    },

    // ── 見守り者（見守りWeb） ──
    async vote(
      actor: string,
      input: { subjectUserId: string },
    ): Promise<ApiResult<{ certified: boolean }>> {
      const [before] = await db
        .select({ state: subjectSettings.state })
        .from(subjectSettings)
        .where(eq(subjectSettings.userId, input.subjectUserId))
        .limit(1);
      const r = await castVote(
        db,
        { subjectUserId: input.subjectUserId, voterUserId: actor },
        config,
      );
      if (!r.ok)
        return {
          ok: false,
          status: r.reason === 'not_a_watcher' ? 403 : 409,
          error: r.reason,
        };
      // 最初の1票で voting に入った時だけ、全見守り者へ投票要請（T3）。
      if (before?.state === 'watchers_alerted')
        await safe(() =>
          notify.notifyWatchers(input.subjectUserId, 'vote_requested'),
        );
      return { ok: true, data: { certified: r.certified } };
    },

    async withdrawVote(
      actor: string,
      input: { subjectUserId: string },
    ): Promise<ApiResult<{ activeVotes: number }>> {
      const r = await withdrawVote(
        db,
        { subjectUserId: input.subjectUserId, voterUserId: actor },
        config,
      );
      if (!r.ok) return { ok: false, status: 409, error: 'no_active_episode' };
      return { ok: true, data: { activeVotes: r.activeVotes } };
    },

    async attest(
      actor: string,
      input: { subjectUserId: string; note?: string },
    ): Promise<ApiResult<{ resolved: boolean }>> {
      const r = await attest(
        db,
        {
          subjectUserId: input.subjectUserId,
          attesterUserId: actor,
          note: input.note,
        },
        config,
      );
      if (!r.ok) return { ok: false, status: 403, error: r.reason ?? 'error' };
      if (r.notifyWatchers)
        await safe(() =>
          notify.notifyWatchers(input.subjectUserId, 'attestation'),
        );
      return { ok: true, data: { resolved: r.resolved } };
    },

    async respondToInvite(
      actor: string,
      input: { subjectUserId: string; accept: boolean },
    ): Promise<ApiResult<{ status: string; disclosureEnabled: boolean }>> {
      const r = await respondToWatchInvite(
        db,
        {
          subjectUserId: input.subjectUserId,
          watcherUserId: actor,
          accept: input.accept,
        },
        config,
      );
      if (!r.ok) return { ok: false, status: 404, error: r.reason };
      return {
        ok: true,
        data: { status: r.status, disclosureEnabled: r.disclosureEnabled },
      };
    },

    // ── 受取人（見守りWeb・懸念フラグ） ──
    async raiseConcern(
      actor: string,
      input: { subjectUserId: string; note?: string },
    ): Promise<ApiResult<Record<string, never>>> {
      const [conn] = await db
        .select({ id: connections.id })
        .from(connections)
        .where(
          and(
            eq(connections.subjectUserId, input.subjectUserId),
            eq(connections.otherUserId, actor),
          ),
        )
        .limit(1);
      if (!conn) return { ok: false, status: 403, error: 'not_a_connection' };
      const r = await raiseConcern(
        db,
        {
          subjectUserId: input.subjectUserId,
          connectionId: conn.id,
          note: input.note,
        },
        config,
      );
      if (!r.ok) return { ok: false, status: 400, error: r.reason ?? 'error' };
      if (r.notifyWatchers)
        await safe(() => notify.notifyWatchers(input.subjectUserId, 'concern'));
      return { ok: true, data: {} };
    },

    // ── つながり管理（本人） ──
    async inviteWatcher(
      actor: string,
      input: { watcherUserId: string; displayName?: string },
    ): Promise<ApiResult<{ connectionId: string; status: string }>> {
      const r = await inviteWatcher(
        db,
        {
          subjectUserId: actor,
          watcherUserId: input.watcherUserId,
          displayName: input.displayName,
        },
        config,
      );
      if (!r.ok)
        return {
          ok: false,
          status: r.reason === 'self' ? 400 : 404,
          error: r.reason,
        };
      await safe(() => notify.notifyWatchInvite(actor, input.watcherUserId));
      return {
        ok: true,
        data: { connectionId: r.connectionId, status: r.status },
      };
    },

    async revokeWatcher(
      actor: string,
      input: { connectionId: string },
    ): Promise<ApiResult<{ disclosureEnabled: boolean }>> {
      const r = await revokeWatcher(
        db,
        { subjectUserId: actor, connectionId: input.connectionId },
        config,
      );
      if (!r.ok) return { ok: false, status: 404, error: r.reason };
      return { ok: true, data: { disclosureEnabled: r.disclosureEnabled } };
    },

    async addContact(
      actor: string,
      input: {
        displayName: string;
        email?: string;
        userId?: string;
        passphraseHint?: string;
      },
    ): Promise<ApiResult<{ connectionId: string }>> {
      const r = await addContact(
        db,
        { subjectUserId: actor, ...input },
        config,
      );
      if (!r.ok) return { ok: false, status: 400, error: r.reason };
      return { ok: true, data: { connectionId: r.connectionId } };
    },

    async setPassphraseHint(
      actor: string,
      input: { connectionId: string; hint: string | null },
    ): Promise<ApiResult<Record<string, never>>> {
      const r = await setPassphraseHint(
        db,
        {
          subjectUserId: actor,
          connectionId: input.connectionId,
          hint: input.hint,
        },
        config,
      );
      if (!r.ok) return { ok: false, status: 404, error: r.reason ?? 'error' };
      return { ok: true, data: {} };
    },

    // ── 最後のメッセージ（本人） ──
    async createMessage(
      actor: string,
      input: EncryptedContent & { recipients: RecipientWrap[] },
    ): Promise<ApiResult<{ messageId: string }>> {
      const r = await createMessage(
        db,
        { subjectUserId: actor, ...input },
        config,
      );
      if (!r.ok) return { ok: false, status: 400, error: r.reason };
      return { ok: true, data: { messageId: r.messageId } };
    },

    async updateMessage(
      actor: string,
      input: { messageId: string } & Partial<EncryptedContent>,
    ): Promise<ApiResult<Record<string, never>>> {
      const r = await updateMessage(
        db,
        { subjectUserId: actor, ...input },
        config,
      );
      if (!r.ok) return { ok: false, status: 404, error: r.reason ?? 'error' };
      return { ok: true, data: {} };
    },

    async setRecipients(
      actor: string,
      input: { messageId: string; recipients: RecipientWrap[] },
    ): Promise<ApiResult<Record<string, never>>> {
      const r = await setMessageRecipients(
        db,
        { subjectUserId: actor, ...input },
        config,
      );
      if (!r.ok) return { ok: false, status: 400, error: r.reason ?? 'error' };
      return { ok: true, data: {} };
    },

    async deleteMessage(
      actor: string,
      input: { messageId: string },
    ): Promise<ApiResult<Record<string, never>>> {
      const r = await deleteMessage(db, {
        subjectUserId: actor,
        messageId: input.messageId,
      });
      if (!r.ok) return { ok: false, status: 404, error: r.reason ?? 'error' };
      return { ok: true, data: {} };
    },

    async listMessages(actor: string): Promise<ApiResult<unknown[]>> {
      return { ok: true, data: await listMessages(db, actor) };
    },
  };
}

export type Handlers = ReturnType<typeof createHandlers>;
