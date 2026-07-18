import type { Auth } from '../lib/auth';

/**
 * 開発専用の認証バイパス。`Authorization: Bearer <secret>:<userId>` を、環境変数
 * DEV_BEARER_SECRET が設定されている場合に限り actor として受け付ける。
 * 本番はこの変数を設定しない＝経路自体が存在しない。Android 実験（OAuth 配線前）用。
 */
export function devActorFromHeader(
  authorizationHeader: string | null,
  devBearerSecret: string | undefined,
): string | null {
  if (!devBearerSecret || !authorizationHeader) return null;
  const m = authorizationHeader.match(/^Bearer (.+?):(.+)$/);
  if (!m) return null;
  const [, secret, userId] = m;
  return secret === devBearerSecret ? userId : null;
}

/**
 * リクエストから認証済みユーザーIDを取り出す（Better Auth のセッション検証）。
 * 本人側アプリはセッショントークンを Authorization/Cookie に載せ、見守りWebは Cookie。
 */
export async function getActorUserId(
  request: Request,
  auth: Auth,
  opts: { devBearerSecret?: string } = {},
): Promise<string | null> {
  const dev = devActorFromHeader(
    request.headers.get('authorization'),
    opts.devBearerSecret,
  );
  if (dev) return dev;

  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user?.id ?? null;
}
