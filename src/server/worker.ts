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
 * CSP（Report-Only）。2026-10-19にEnforceへ切り替えたが、TanStack Startが
 * ハイドレーション用に自動挿入する内部スクリプト（window.$_TSRを初期化するもの。
 * __root.tsx外・リクエストごとに内容が変わるため固定sha256ハッシュを割り当てられない）が
 * ブロックされ、ハイドレーションがクラッシュして全ページが真っ暗になる障害が発生したため、
 * 同日中にEnforceを撤回してReport-Onlyへ戻した。
 * 正しく直すには nonce を発行して router.options.ssr.nonce に渡す必要があり
 * （TanStack Start側はnonceに対応済み。@tanstack/router-core/src/ssr/renderRouterToStream.tsx等）、
 * 配線を検証してからEnforceに再挑戦する。
 *
 * 許可元の根拠（__root.tsx / src/web 配下を精査した結果、および運用中のCSP違反ログ）:
 *   - script-src: 外部 <script src> は無い。__root.tsx のインライン2本（PWAインストール
 *     プロンプト捕捉・SW登録）だけは 'unsafe-inline' を避け sha256 ハッシュで個別許可する。
 *     ⚠ その2本の中身を書き換えたら、このハッシュも計算し直すこと（内容が変わると不一致で
 *     Report-Only でも違反として報告される）。
 *     PostHogは posthog-js 本体こそ動的importで自ドメインにバンドルされるが、内部で追加の
 *     拡張機能を us-assets.i.posthog.com から読み込むため許可が要る（公式推奨により
 *     サブドメイン変更に備え https://*.posthog.com を許可: https://posthog.com/docs/advanced/content-security-policy）。
 *   - style-src: index.tsx（LP）/ beta.tsx が <style dangerouslySetInnerHTML> で可変長CSSを
 *     注入しており、ハッシュ運用は非現実的なため 'unsafe-inline' を許可（スタイル注入は
 *     スクリプト注入より実害が小さい一般的な妥協）。
 *   - img-src: OAuth プロフィール画像（Google=googleusercontent.com、LINE=line-scdn.net）。
 *   - connect-src: PostHogの計測イベント送信先。
 *   - frame-ancestors: 'none'。他サイトへの埋め込み（クリックジャッキング）は不要。
 *   - Google/LINE のOAuth遷移は window.location によるトップレベルナビゲーションであり、
 *     CSP の対象外（フォーム送信でもiframeでもない）のため許可不要。
 *
 * ⚠ Cloudflareがエッジで自動注入するもの（Web Analyticsビーコン static.cloudflareinsights.com、
 *   メールアドレス難読化のインラインdecode script）はここには含めない。アプリ側の許可では
 *   なくCloudflareダッシュボード側の機能を無効化して止める方針（2026-09-29 判断）。
 */
const BASE_CSP_DIRECTIVES = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "script-src 'self' https://*.posthog.com 'sha256-PqZJSkwfg1zFos+vTv4jM7IKkGBsRGDwU7svZfUCUZg=' 'sha256-ERjmq+b4OE6wevDvl+VSUxKEvvc14aHmoifc8WMQDT4='",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://*.googleusercontent.com https://*.line-scdn.net",
  "connect-src 'self' https://*.posthog.com",
  "form-action 'self'",
  "frame-ancestors 'none'",
];

/**
 * SentryのDSNから、CSP違反レポート専用の受け口URL（Security Header Reports）を導出する。
 * 例: https://<key>@o<org>.ingest.<region>.sentry.io/<projectId>
 *   → https://o<org>.ingest.<region>.sentry.io/api/<projectId>/security/?sentry_key=<key>
 */
function sentrySecurityReportUri(dsn: string): string | undefined {
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\//, '');
    if (!url.username || !projectId) return undefined;
    return `https://${url.host}/api/${projectId}/security/?sentry_key=${url.username}`;
  } catch {
    return undefined;
  }
}

/**
 * SENTRY_DSN は wrangler.jsonc の vars にのみ設定している（instrument.server.ts と同じ方針）ため、
 * 開発（wrangler-dev.jsonc）では report-uri 自体が付かない＝CSP違反を送らない。
 */
function withCsp(response: Response, env: { SENTRY_DSN?: string }): Response {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html')) return response;

  const reportUri = env.SENTRY_DSN && sentrySecurityReportUri(env.SENTRY_DSN);
  const directives = reportUri
    ? [...BASE_CSP_DIRECTIVES, `report-uri ${reportUri}`]
    : BASE_CSP_DIRECTIVES;

  const headers = new Headers(response.headers);
  headers.set('Content-Security-Policy-Report-Only', directives.join('; '));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  fetch: async (request: Request, env: unknown, ctx: unknown) =>
    withCsp(
      withNoStore(await startHandler.fetch(request, env, ctx)),
      env as { SENTRY_DSN?: string },
    ),

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
