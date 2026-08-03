import { createFileRoute } from '@tanstack/react-router';
import { ConfigError, createRequestApp } from '../server/app';
import { getServerEnv } from '../server/env';

/**
 * ネイティブ LINE ログインの受け渡し口（サーバールート）。
 *
 * Custom Tab で Web の LINE OAuth 往復を完了すると、better-auth が同一オリジンに
 * セッション Cookie を張った状態でここへ 302 で戻ってくる（/native/line が callbackURL に
 * 指定）。ここで Cookie からセッションを解決し、その bearer トークンを asatomo:// ディープ
 * リンクで Android アプリへ返す。
 *
 * bearer トークンについて: better-auth の bearer プラグインは「ドットを含まない生トークンは
 * サーバ側で署名して検証」するため、session.token（DB の生トークン）をそのまま
 * Authorization: Bearer に使える。Cookie 値を手でパースする必要はない。
 *
 * ⚠ セキュリティ: 現状はカスタムスキーム（asatomo://）でトークンを返す。カスタムスキームは
 *    他アプリに横取りされうるため、将来的に App Links（検証済み https）かワンタイムコード
 *    交換へ堅牢化する余地がある（まず動かす方針で簡易版）。トークンは URL に載るのでログ禁止。
 */
export const Route = createFileRoute('/native/handoff')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        let auth: ReturnType<typeof createRequestApp>['auth'];
        try {
          auth = createRequestApp(getServerEnv()).auth;
        } catch (e) {
          if (e instanceof ConfigError)
            return Response.json(
              { error: 'server_not_configured', message: e.message },
              { status: 503 },
            );
          throw e;
        }

        const session = await auth.api.getSession({ headers: request.headers });
        // セッション無し = OAuth 失敗 or Cookie 未着。アプリ側でエラー表示できるよう error で返す。
        if (!session) return deepLink({ error: 'no_session' });

        return deepLink({
          token: session.session.token,
          name: session.user.name ?? '',
          email: session.user.email ?? '',
        });
      },
    },
  },
});

/** asatomo://auth?... へ 302 リダイレクトする Response を組み立てる。 */
function deepLink(params: Record<string, string>): Response {
  const qs = new URLSearchParams(params).toString();
  return new Response(null, {
    status: 302,
    headers: { Location: `asatomo://auth?${qs}` },
  });
}
