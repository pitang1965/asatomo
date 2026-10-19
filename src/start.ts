import { createMiddleware, createStart } from '@tanstack/react-start';
import { setResponseHeader } from '@tanstack/react-start/server';

/**
 * CSP（Enforce・実験中）。2026-10-19にEnforce化したところ、TanStack Startが
 * ハイドレーション用に自動挿入する内部スクリプト（window.$_TSRを初期化するもの。
 * __root.tsx外・リクエストごとに内容が変わるため固定sha256ハッシュを割り当てられない）が
 * ブロックされ、ハイドレーションがクラッシュして全ページが真っ暗になる障害が発生し、
 * 一度Report-Onlyへ戻した。
 *
 * 今回はリクエストごとにnonceを発行し、TanStack Start側のnonce対応
 * （router.options.ssr.nonce → React本体のストリーミングレンダラー・
 * <meta property="csp-nonce">・$_TSRのハイドレーションスクリプトの3箇所に
 * 自動配線される。@tanstack/router-core/src/ssr/hydrationScripts.ts等で確認）に
 * 乗せることで、動的スクリプトもEnforceの対象にする。
 * nonceはこのリクエストミドルウェアで生成し、next({context:{nonce}})で
 * contextAfterGlobalMiddlewaresに積む → src/router.tsx の getRouter() が
 * getGlobalStartContext() 経由で読み、createRouter({ ssr: { nonce } }) に渡す。
 *
 * 許可元の根拠（__root.tsx / src/web 配下を精査した結果、および運用中のCSP違反ログ）:
 *   - script-src: 外部 <script src> は無い。__root.tsx のインライン2本（PWAインストール
 *     プロンプト捕捉・SW登録）は 'unsafe-inline' を避け sha256 ハッシュで個別許可する
 *     （こちらは内容が固定なのでnonceではなくハッシュのままにしている）。
 *     ⚠ その2本の中身を書き換えたら、このハッシュも計算し直すこと（内容が変わると
 *     不一致でEnforceだと実際にブロックされ機能が壊れる）。
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
const STATIC_SCRIPT_SRC_HASHES = [
  "'sha256-PqZJSkwfg1zFos+vTv4jM7IKkGBsRGDwU7svZfUCUZg='",
  "'sha256-ERjmq+b4OE6wevDvl+VSUxKEvvc14aHmoifc8WMQDT4='",
];

function buildCspDirectives(nonce: string, reportUri?: string): string[] {
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    `script-src 'self' https://*.posthog.com 'nonce-${nonce}' ${STATIC_SCRIPT_SRC_HASHES.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://*.googleusercontent.com https://*.line-scdn.net",
    "connect-src 'self' https://*.posthog.com",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (reportUri) directives.push(`report-uri ${reportUri}`);
  return directives;
}

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

function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

/**
 * SENTRY_DSN は wrangler.jsonc の vars にのみ設定している（instrument.server.ts と同じ方針）ため、
 * 開発（wrangler-dev.jsonc）では report-uri 自体が付かない＝CSP違反を送らない。
 */
const cspMiddleware = createMiddleware({ type: 'request' }).server(
  async ({ next }) => {
    const nonce = randomNonce();
    const result = await next({ context: { nonce } });

    const contentType = result.response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html')) return result;

    const reportUri =
      process.env.SENTRY_DSN && sentrySecurityReportUri(process.env.SENTRY_DSN);
    setResponseHeader(
      'Content-Security-Policy',
      buildCspDirectives(nonce, reportUri).join('; '),
    );
    return result;
  },
);

export const startInstance = createStart(() => ({
  requestMiddleware: [cspMiddleware],
}));
