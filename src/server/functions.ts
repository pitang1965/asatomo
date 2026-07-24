import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { z } from 'zod';
import {
  type AccountDeletionPreview,
  previewAccountDeletion,
} from '../domain/account';
import {
  getInvitationPreview,
  type InvitationInvalidReason,
} from '../domain/invitations';
import { listMessages } from '../domain/messages';
import { DEFAULT_DOMAIN_CONFIG } from '../domain/monitoring';
import {
  type ActivityEntry,
  type DashboardRow,
  type DeathConfirmInfo,
  getDeathConfirmInfo,
  getSubjectActivityHistory,
  getSubjectConnections,
  getSubjectWatchers,
  getWatcherDashboard,
  hasAcceptedWatcher,
  type SubjectConnection,
  type SubjectWatcher,
} from '../domain/queries';
import { ConfigError, createRequestApp } from './app';
import { getServerEnv } from './env';

/**
 * 見守りWeb 用のサーバー関数（ローダーから RPC で呼ぶ）。状態を判別可能ユニオンで返し、
 * 画面側は「未設定 → 案内 / 未ログイン → 分岐 / OK → 実データ」に分ける。
 * 認証・設定ガードは _app レイアウトが一元化するが、各関数もセッションを確認する
 * （ローダーは独立に走りうるため。多重防御）。
 */

/**
 * 共通レイアウト（_app）のガード用。セッションと設定状態だけを軽く返す。
 * ページ本体のデータは各ルートのローダーが別途取る（ここでは持たない）。
 * user は将来のブランドヘッダー（アバター）でも使う。
 */
export type ShellData =
  | { status: 'unconfigured'; message: string }
  | { status: 'signed_out' }
  | {
      status: 'ok';
      user: { id: string; name: string; image: string | null };
    };

export const fetchShell = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ShellData> => {
    let app: ReturnType<typeof createRequestApp>;
    try {
      app = createRequestApp(getServerEnv());
    } catch (e) {
      if (e instanceof ConfigError)
        return { status: 'unconfigured', message: e.message };
      throw e;
    }

    const request = getRequest();
    const session = await app.auth.api.getSession({ headers: request.headers });
    if (!session) return { status: 'signed_out' };
    return {
      status: 'ok',
      user: {
        id: session.user.id,
        name: session.user.name,
        image: session.user.image ?? null,
      },
    };
  },
);

/**
 * 「わたし」タブ（/me）の材料。見られる側の要約。ADR-0008 §実装決定6。
 *   - watchersTotal: あなたを見守ってくれている人の数（accepted）。0 なら空状態カードへ。
 *   - watchersLiving: そのうち休眠しきい値以内の人数。2 未満なら開示ライン割れの警告を出す。
 * isSubject（様子送信・自動チェックインのゲート）は watchersTotal > 0 と同値。
 */
export type MeData =
  | { status: 'unconfigured'; message: string }
  | { status: 'signed_out' }
  | {
      status: 'ok';
      userName: string;
      watchersTotal: number;
      watchersLiving: number;
    };

export const fetchMe = createServerFn({ method: 'GET' }).handler(
  async (): Promise<MeData> => {
    let app: ReturnType<typeof createRequestApp>;
    try {
      app = createRequestApp(getServerEnv());
    } catch (e) {
      if (e instanceof ConfigError)
        return { status: 'unconfigured', message: e.message };
      throw e;
    }

    const request = getRequest();
    const session = await app.auth.api.getSession({ headers: request.headers });
    if (!session) return { status: 'signed_out' };

    const watchers = await getSubjectWatchers(
      app.db,
      session.user.id,
      DEFAULT_DOMAIN_CONFIG,
    );
    return {
      status: 'ok',
      userName: session.user.name,
      watchersTotal: watchers.length,
      watchersLiving: watchers.filter((w) => w.isLiving).length,
    };
  },
);

/**
 * 「仲間」タブ（/watch）の材料＝あなたが見守っている人の一覧。ADR-0008。
 * 旧トップに埋まっていた見守りダッシュボードをこの独立ルートへ移設した。
 */
export type WatchData =
  | { status: 'unconfigured'; message: string }
  | { status: 'signed_out' }
  | { status: 'ok'; rows: DashboardRow[] };

export const fetchWatch = createServerFn({ method: 'GET' }).handler(
  async (): Promise<WatchData> => {
    let app: ReturnType<typeof createRequestApp>;
    try {
      app = createRequestApp(getServerEnv());
    } catch (e) {
      if (e instanceof ConfigError)
        return { status: 'unconfigured', message: e.message };
      throw e;
    }

    const request = getRequest();
    const session = await app.auth.api.getSession({ headers: request.headers });
    if (!session) return { status: 'signed_out' };

    return {
      status: 'ok',
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

/**
 * つながり整理ページ（本人側）の材料＝「今わたしを見守ってくれている人」。
 * signed_out は未ログイン。承諾済み見守り者が居なければ watchers は空（案内を出す）。
 */
export type ConnectionsPageData =
  | { status: 'unconfigured'; message: string }
  | { status: 'signed_out' }
  | { status: 'ok'; userName: string; watchers: SubjectWatcher[] };

export const fetchConnectionsPage = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ConnectionsPageData> => {
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
      watchers: await getSubjectWatchers(
        app.db,
        session.user.id,
        DEFAULT_DOMAIN_CONFIG,
      ),
    };
  },
);

/** アカウント画面（/account）の材料。プロフィール要約とログアウト・削除の入口。 */
export type AccountData =
  | { status: 'unconfigured'; message: string }
  | { status: 'signed_out' }
  | {
      status: 'ok';
      userName: string;
      userEmail: string;
      userImage: string | null;
    };

export const fetchAccount = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AccountData> => {
    let app: ReturnType<typeof createRequestApp>;
    try {
      app = createRequestApp(getServerEnv());
    } catch (e) {
      if (e instanceof ConfigError)
        return { status: 'unconfigured', message: e.message };
      throw e;
    }

    const request = getRequest();
    const session = await app.auth.api.getSession({ headers: request.headers });
    if (!session) return { status: 'signed_out' };

    return {
      status: 'ok',
      userName: session.user.name,
      userEmail: session.user.email,
      userImage: session.user.image ?? null,
    };
  },
);

/**
 * アカウント削除の確認画面（/account/delete）の材料。削除で網が縮む本人ごとの結果を
 * 変更せず集計して返す（ADR-0007 §2 の「情報つきの摩擦」）。
 */
export type AccountDeletePreviewData =
  | { status: 'unconfigured'; message: string }
  | { status: 'signed_out' }
  | { status: 'ok'; userName: string; preview: AccountDeletionPreview };

export const fetchAccountDeletePreview = createServerFn({
  method: 'GET',
}).handler(async (): Promise<AccountDeletePreviewData> => {
  let app: ReturnType<typeof createRequestApp>;
  try {
    app = createRequestApp(getServerEnv());
  } catch (e) {
    if (e instanceof ConfigError)
      return { status: 'unconfigured', message: e.message };
    throw e;
  }

  const request = getRequest();
  const session = await app.auth.api.getSession({ headers: request.headers });
  if (!session) return { status: 'signed_out' };

  return {
    status: 'ok',
    userName: session.user.name,
    preview: await previewAccountDeletion(
      app.db,
      session.user.id,
      DEFAULT_DOMAIN_CONFIG,
    ),
  };
});

/**
 * 自分のアクティビティ履歴画面（/activity・本人側）の材料。透明性の画面。
 * 履歴は本人だけに見せる（見守り者には最新1件のみ。grill 決定 2026-07-23）。isSubject は
 * 「見守り者にはこう見えます」の対比を出すかの分岐（見守ってくれる人が居なければ誰にも届かない）。
 */
export type ActivityHistoryData =
  | { status: 'unconfigured'; message: string }
  | { status: 'signed_out' }
  | {
      status: 'ok';
      userName: string;
      isSubject: boolean;
      entries: ActivityEntry[];
    };

export const fetchActivityHistory = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ActivityHistoryData> => {
    let app: ReturnType<typeof createRequestApp>;
    try {
      app = createRequestApp(getServerEnv());
    } catch (e) {
      if (e instanceof ConfigError)
        return { status: 'unconfigured', message: e.message };
      throw e;
    }

    const request = getRequest();
    const session = await app.auth.api.getSession({ headers: request.headers });
    if (!session) return { status: 'signed_out' };

    return {
      status: 'ok',
      userName: session.user.name,
      isSubject: await hasAcceptedWatcher(app.db, session.user.id),
      entries: await getSubjectActivityHistory(app.db, session.user.id),
    };
  },
);

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
