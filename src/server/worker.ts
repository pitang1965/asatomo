import startHandler from '@tanstack/react-start/server-entry';
import { runMonitoringTick } from '../cron/monitoring-tick';
import { createRequestApp } from './app';
import { getServerEnv } from './env';

/**
 * Cloudflare Workers エントリ（wrangler.jsonc の main）。
 *   - fetch: TanStack Start（SSR + /api/*）へそのまま委譲。
 *   - scheduled: 監視tick（時間駆動の状態遷移 T1/T2/T5。約15分間隔の Cron Triggers）。
 * 環境変数は nodejs_compat により vars/secrets が process.env に写る（src/server/env.ts）。
 * D1バインディングはprocess.envに現れないため別経路（cloudflare:workersのambient env、
 * src/db/index.ts）— scheduledがenvを受け取っても使わないのはこのため。
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

/**
 * CSP（Report-Only）。XSS対策の多層防御として導入するが、まずは違反を壊さず観測するため
 * Enforce ではなく Report-Only から始める（ヘッダーだけ付与しブラウザは何もブロックしない。
 * 違反は DevTools の Console に出る）。しばらく様子を見て問題なければ
 * Content-Security-Policy（Enforce）に切り替える。
 *
 * 許可元の根拠（__root.tsx / src/web 配下を精査した結果）:
 *   - script-src: 外部 <script src> は無い。__root.tsx のインライン2本（PWAインストール
 *     プロンプト捕捉・SW登録）だけは 'unsafe-inline' を避け sha256 ハッシュで個別許可する。
 *     ⚠ その2本の中身を書き換えたら、このハッシュも計算し直すこと（内容が変わると不一致で
 *     Report-Only でも違反として報告される）。
 *   - style-src: index.tsx（LP）/ beta.tsx が <style dangerouslySetInnerHTML> で可変長CSSを
 *     注入しており、ハッシュ運用は非現実的なため 'unsafe-inline' を許可（スタイル注入は
 *     スクリプト注入より実害が小さい一般的な妥協）。
 *   - img-src: OAuth プロフィール画像（Google=googleusercontent.com、LINE=line-scdn.net）。
 *   - connect-src: PostHog（posthog-js は動的importで自ドメインにバンドルされるが、
 *     計測イベントの送信先 api_host は us.i.posthog.com）。
 *   - frame-ancestors: 'none'。他サイトへの埋め込み（クリックジャッキング）は不要。
 *   - Google/LINE のOAuth遷移は window.location によるトップレベルナビゲーションであり、
 *     CSP の対象外（フォーム送信でもiframeでもない）のため許可不要。
 */
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "script-src 'self' 'sha256-PqZJSkwfg1zFos+vTv4jM7IKkGBsRGDwU7svZfUCUZg=' 'sha256-ERjmq+b4OE6wevDvl+VSUxKEvvc14aHmoifc8WMQDT4='",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://*.googleusercontent.com https://*.line-scdn.net",
  "connect-src 'self' https://us.i.posthog.com",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

function withCsp(response: Response): Response {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html')) return response;

  const headers = new Headers(response.headers);
  headers.set('Content-Security-Policy-Report-Only', CSP);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  fetch: async (request: Request, env: unknown, ctx: unknown) =>
    withCsp(withNoStore(await startHandler.fetch(request, env, ctx))),

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
