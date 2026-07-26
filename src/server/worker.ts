import startHandler from '@tanstack/react-start/server-entry';
import { runMonitoringTick } from '../cron/monitoring-tick';
import { createRequestApp } from './app';
import { getServerEnv } from './env';

/**
 * Cloudflare Workers エントリ（wrangler.jsonc の main）。
 *   - fetch: TanStack Start（SSR + /api/*）へそのまま委譲。
 *   - scheduled: 監視tick（時間駆動の状態遷移 T1/T2/T5。約15分間隔の Cron Triggers）。
 * 環境変数は nodejs_compat により vars/secrets が process.env に写る（src/server/env.ts）。
 */

interface Ctx {
  waitUntil(promise: Promise<unknown>): void;
}

/**
 * 認証状態に依存する動的レスポンス（SSR の HTML ドキュメントと認証リダイレクト）を、
 * ブラウザやキャッシュに一切残させない。`no-store` は HTTP キャッシュだけでなく
 * bfcache（戻る/進むの復元）も無効化するため、ログアウト後に古い「ログイン済み」画面が
 * 復元される不具合を断つ。
 *
 * 背景: Android Chrome にインストールした standalone PWA で、ログアウト直後に `/` へ
 *   遷移すると、古い `/`→/me リダイレクト（または /me 本体）がキャッシュ/bfcache から
 *   再利用され、実際にはセッションが消えているのにログイン済み画面が出ていた
 *   （PWA=SW を外すと再現しないことで確認）。SW を network-only にした ADR-0010 や、
 *   古い状態を“今”として見せない ADR-0009 と同じ方針。
 *
 * ハッシュ付き静的アセット（JS/CSS/画像。content-type が html でなくリダイレクトでもない）は
 * 対象外＝従来どおりキャッシュ可能に残す。
 */
function withNoStore(response: Response): Response {
  const contentType = response.headers.get('content-type') ?? '';
  const isDocument = contentType.includes('text/html');
  const isRedirect = response.status >= 300 && response.status < 400;
  if (!isDocument && !isRedirect) return response;
  if (response.headers.get('cache-control')?.includes('no-store'))
    return response;

  const headers = new Headers(response.headers);
  // new Headers(...) は複数の Set-Cookie を 1 本に結合してしまう実装がある。
  // OAuth コールバックのセッション付与や sign-out のクリアを壊さないよう、
  // Set-Cookie は getSetCookie() で取り出して個別に再付与する。
  const setCookies = response.headers.getSetCookie?.() ?? [];
  if (setCookies.length > 0) {
    headers.delete('set-cookie');
    for (const cookie of setCookies) headers.append('set-cookie', cookie);
  }
  headers.set('cache-control', 'no-store, must-revalidate');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  fetch: async (request: Request, env: unknown, ctx: unknown) =>
    withNoStore(await startHandler.fetch(request, env, ctx)),

  async scheduled(_controller: unknown, _env: unknown, ctx: Ctx) {
    const app = createRequestApp(getServerEnv());
    ctx.waitUntil(
      runMonitoringTick(app.db, app.notify, {
        stage1to2DelayHours: 12,
        batchLimit: 20,
      }),
    );
  },
};
