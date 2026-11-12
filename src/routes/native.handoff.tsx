import { createFileRoute } from '@tanstack/react-router';
import {
  CHALLENGE_RE,
  createHandoffCode,
  redeemHandoffCode,
} from '../domain/native-handoff';
import { ConfigError, createRequestApp } from '../server/app';
import { getServerEnv } from '../server/env';

/**
 * ネイティブ LINE ログインの受け渡し口（サーバールート）。
 *
 * GET: Custom Tab で Web の LINE OAuth 往復を完了すると、better-auth が同一オリジンに
 *   セッション Cookie を張った状態でここへ 302 で戻ってくる（/native/line が callbackURL に
 *   指定。?c= はアプリが作った PKCE challenge）。Cookie からセッションを解決し、
 *   使い捨てコードだけを asatomo:// ディープリンクでアプリへ返す。
 * POST: アプリがコード＋verifier を本物のセッショントークン（＋表示用の氏名・メール）に交換する。
 *
 * ⚠ セキュリティ: カスタムスキーム（asatomo://）は他アプリに横取りされうる。だから URL には
 *    トークンも個人情報も載せない。載るのは「verifier が無いと使えない・2分で切れる・1回限り」
 *    のコードだけ（src/domain/native-handoff.ts）。?c= の無い旧方式（トークン直渡し）は
 *    抜け道になるので受け付けない。残る限界（悪意あるアプリが自分でログインを始める場合）は
 *    native-handoff.ts の shortcut コメント参照。
 *
 * bearer トークンについて: better-auth の bearer プラグインは「ドットを含まない生トークンは
 * サーバ側で署名して検証」するため、session.token（DB の生トークン）をそのまま
 * Authorization: Bearer に使える。Cookie 値を手でパースする必要はない。
 */
export const Route = createFileRoute('/native/handoff')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const app = requestApp();
        if (app instanceof Response) return app;

        const session = await app.auth.api.getSession({
          headers: request.headers,
        });
        // セッション無し = OAuth 失敗 or Cookie 未着。アプリ側でエラー表示できるよう error で返す。
        if (!session) return deepLink({ error: 'no_session' });

        const challenge = new URL(request.url).searchParams.get('c') ?? '';
        if (!CHALLENGE_RE.test(challenge))
          return deepLink({ error: 'bad_request' });

        const code = await createHandoffCode(app.db, {
          sessionToken: session.session.token,
          challenge,
        });
        return deepLink({ code });
      },

      POST: async ({ request }) => {
        const app = requestApp();
        if (app instanceof Response) return app;

        const body = (await request.json().catch(() => null)) as {
          code?: unknown;
          verifier?: unknown;
        } | null;
        const invalid = () =>
          Response.json({ error: 'invalid_code' }, { status: 400 });
        if (typeof body?.code !== 'string' || typeof body.verifier !== 'string')
          return invalid();

        const token = await redeemHandoffCode(app.db, {
          code: body.code,
          verifier: body.verifier,
        });
        if (!token) return invalid();

        // トークンがまだ生きているかの確認を兼ねて、表示用の氏名・メールを引く。
        const session = await app.auth.api.getSession({
          headers: new Headers({ authorization: `Bearer ${token}` }),
        });
        if (!session) return invalid();

        return Response.json(
          {
            token,
            user: {
              name: session.user.name ?? '',
              email: session.user.email ?? '',
            },
          },
          { headers: { 'cache-control': 'no-store' } },
        );
      },
    },
  },
});

function requestApp(): ReturnType<typeof createRequestApp> | Response {
  try {
    return createRequestApp(getServerEnv());
  } catch (e) {
    if (e instanceof ConfigError)
      return Response.json(
        { error: 'server_not_configured', message: e.message },
        { status: 503 },
      );
    throw e;
  }
}

/** asatomo://auth?... へ 302 リダイレクトする Response を組み立てる。 */
function deepLink(params: Record<string, string>): Response {
  const qs = new URLSearchParams(params).toString();
  return new Response(null, {
    status: 302,
    headers: { Location: `asatomo://auth?${qs}` },
  });
}
