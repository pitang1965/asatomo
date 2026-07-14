import type { ApiResult } from './context';
import type { Handlers } from './handlers';

/**
 * Web 標準（Request → Response）の API ルーター。Cloudflare Workers / TanStack Start の
 * サーバールートから呼べる。認証済み actorUserId とパース済み body を各ハンドラへ渡す。
 *
 * 実際の配線（env から createDb/createAuth/createNotifications を組み、getActorUserId で
 * セッション解決）はデプロイ層で行う。ここは「認証必須 + JSON + ディスパッチ + エラー写像」の
 * 共通部分。ルート表を1か所にまとめ、認可はハンドラ側に委ねる。
 */

/** メソッド+パス → ハンドラ名。パスは /api 以下（プレフィックスは呼び出し側で除去）。 */
const ROUTES: Record<string, keyof Handlers> = {
  'POST /signals': 'signal',
  'POST /travel': 'setTravel',
  'DELETE /travel': 'clearTravel',
  'POST /disclosure/cancel': 'cancelDisclosure',
  'POST /watch/vote': 'vote',
  'POST /watch/vote/withdraw': 'withdrawVote',
  'POST /watch/attest': 'attest',
  'POST /watch/respond': 'respondToInvite',
  'POST /watch/concern': 'raiseConcern',
  'POST /connections/invite': 'inviteWatcher',
  'POST /connections/revoke': 'revokeWatcher',
  'POST /connections/contact': 'addContact',
  'POST /connections/passphrase-hint': 'setPassphraseHint',
  'POST /messages': 'createMessage',
  'PATCH /messages': 'updateMessage',
  'POST /messages/recipients': 'setRecipients',
  'DELETE /messages': 'deleteMessage',
  'GET /messages': 'listMessages',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * @param path /api プレフィックスを除いたパス（例: "/signals"）
 * @param actorUserId 認証済みユーザー（null なら 401）
 */
export async function dispatch(
  handlers: Handlers,
  method: string,
  path: string,
  actorUserId: string | null,
  body: unknown,
): Promise<Response> {
  const name = ROUTES[`${method} ${path}`];
  if (!name) return json({ error: 'not_found' }, 404);
  if (!actorUserId) return json({ error: 'unauthorized' }, 401);

  const handler = handlers[name] as unknown as (
    actor: string,
    input: unknown,
  ) => Promise<ApiResult>;
  const result = await handler(actorUserId, body ?? {});
  return result.ok
    ? json(result.data, 200)
    : json({ error: result.error }, result.status);
}
