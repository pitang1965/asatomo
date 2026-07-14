import type { Auth } from '../lib/auth';

/**
 * リクエストから認証済みユーザーIDを取り出す（Better Auth のセッション検証）。
 * 本人側アプリはセッショントークンを Authorization/Cookie に載せ、見守りWebは Cookie。
 */
export async function getActorUserId(
  request: Request,
  auth: Auth,
): Promise<string | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user?.id ?? null;
}
