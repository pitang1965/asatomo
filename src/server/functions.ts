import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { z } from 'zod';
import {
  getInvitationPreview,
  type InvitationInvalidReason,
} from '../domain/invitations';
import { listMessages } from '../domain/messages';
import { DEFAULT_DOMAIN_CONFIG } from '../domain/monitoring';
import {
  type DashboardRow,
  type DeathConfirmInfo,
  getDeathConfirmInfo,
  getSubjectConnections,
  getWatcherDashboard,
  type SubjectConnection,
} from '../domain/queries';
import { ConfigError, createRequestApp } from './app';
import { getServerEnv } from './env';

/**
 * 見守りWeb 用のサーバー関数（ローダーから RPC で呼ぶ）。
 * 状態を3値で返し、画面側は「未設定 → 案内 / 未ログイン → ログイン / OK → 実データ」に分岐する。
 */
export type DashboardData =
  | { status: 'unconfigured'; message: string }
  | { status: 'signed_out' }
  | { status: 'ok'; userName: string; rows: DashboardRow[] };

export const fetchDashboard = createServerFn({ method: 'GET' }).handler(
  async (): Promise<DashboardData> => {
    let app: ReturnType<typeof createRequestApp>;
    try {
      app = createRequestApp(getServerEnv());
    } catch (e) {
      if (e instanceof ConfigError)
        return { status: 'unconfigured', message: e.message };
      throw e;
    }

    const request = getRequest();
    const session = await app.auth.api.getSession({
      headers: request.headers,
    });
    if (!session) return { status: 'signed_out' };

    return {
      status: 'ok',
      userName: session.user.name,
      rows: await getWatcherDashboard(app.db, session.user.id),
    };
  },
);

/**
 * 死亡確認画面の材料。'forbidden' = 未ログイン or 見守り者でない（画面を出さない）。
 */
export type DeathConfirmData =
  | { status: 'unconfigured'; message: string }
  | { status: 'forbidden' }
  | { status: 'ok'; info: DeathConfirmInfo };

export const fetchDeathConfirm = createServerFn({ method: 'GET' })
  .validator(z.object({ subjectUserId: z.string().min(1) }))
  .handler(async ({ data }): Promise<DeathConfirmData> => {
    let app: ReturnType<typeof createRequestApp>;
    try {
      app = createRequestApp(getServerEnv());
    } catch (e) {
      if (e instanceof ConfigError)
        return { status: 'unconfigured', message: e.message };
      throw e;
    }

    const request = getRequest();
    const session = await app.auth.api.getSession({
      headers: request.headers,
    });
    if (!session) return { status: 'forbidden' };

    const info = await getDeathConfirmInfo(
      app.db,
      data.subjectUserId,
      session.user.id,
      DEFAULT_DOMAIN_CONFIG,
    );
    if (!info) return { status: 'forbidden' };
    return { status: 'ok', info };
  });

/**
 * 招待の承諾ランディング（/join/$token）の材料。未ログインでも招待者名を見せたいので
 * セッションは任意（signedIn で分岐）。実際の承諾は /api/invitations/accept（要認証）。
 */
export type InvitePreviewData =
  | { status: 'unconfigured'; message: string }
  | { status: 'invalid'; reason: InvitationInvalidReason }
  | { status: 'ok'; inviterName: string; signedIn: boolean; isSelf: boolean };

export const fetchInvitePreview = createServerFn({ method: 'GET' })
  .validator(z.object({ token: z.string().min(1) }))
  .handler(async ({ data }): Promise<InvitePreviewData> => {
    let app: ReturnType<typeof createRequestApp>;
    try {
      app = createRequestApp(getServerEnv());
    } catch (e) {
      if (e instanceof ConfigError)
        return { status: 'unconfigured', message: e.message };
      throw e;
    }

    const preview = await getInvitationPreview(app.db, data.token, new Date());
    if (!preview.valid) return { status: 'invalid', reason: preview.reason };

    const request = getRequest();
    const session = await app.auth.api.getSession({ headers: request.headers });
    return {
      status: 'ok',
      inviterName: preview.inviterName,
      signedIn: !!session,
      isSelf: session?.user.id === preview.inviterUserId,
    };
  });

/** 最後のメッセージ管理画面（本人側）の材料。暗号材料は不透明なまま返す（復号は端末）。 */
export type MessagesPageData =
  | { status: 'unconfigured'; message: string }
  | { status: 'signed_out' }
  | {
      status: 'ok';
      userName: string;
      connections: SubjectConnection[];
      messages: Awaited<ReturnType<typeof listMessages>>;
    };

export const fetchMessagesPage = createServerFn({ method: 'GET' }).handler(
  async (): Promise<MessagesPageData> => {
    let app: ReturnType<typeof createRequestApp>;
    try {
      app = createRequestApp(getServerEnv());
    } catch (e) {
      if (e instanceof ConfigError)
        return { status: 'unconfigured', message: e.message };
      throw e;
    }

    const request = getRequest();
    const session = await app.auth.api.getSession({
      headers: request.headers,
    });
    if (!session) return { status: 'signed_out' };

    return {
      status: 'ok',
      userName: session.user.name,
      connections: await getSubjectConnections(app.db, session.user.id),
      messages: await listMessages(app.db, session.user.id),
    };
  },
);
