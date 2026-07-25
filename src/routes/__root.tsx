import { createRootRoute, HeadContent, Scripts } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import appCss from '../web/watch.css?url';

/** ルートドキュメント。watch.css（夜明けパレット）を全ページに適用する。 */
export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'アサトモ 見守りWeb' },
      {
        name: 'description',
        content:
          '目覚ましを止めるだけで、大切な人に「今日も元気」が伝わる。一人暮らしの朝を、そっと見守り合うサービスです。',
      },
      // OGP / Twitter カード（SSR で初期HTMLに乗るためクローラにも届く）。
      // 絶対URLは正準ドメイン asatomo.nafuda.me を用いる。
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'アサトモ' },
      { property: 'og:locale', content: 'ja_JP' },
      { property: 'og:url', content: 'https://asatomo.nafuda.me/' },
      {
        property: 'og:title',
        content:
          'アサトモ｜目覚ましを止めるだけで、大切な人に「今日も元気」が伝わる',
      },
      {
        property: 'og:description',
        content:
          '一人暮らしの朝を、誰かがゆるく知ってる安心。見張るのではなく、そっと寄り添う見守りです。',
      },
      { property: 'og:image', content: 'https://asatomo.nafuda.me/ogp.png' },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      {
        property: 'og:image:alt',
        content:
          'アサトモ — 目覚ましを止めるだけで、大切な人に「今日も元気」が伝わる',
      },
      { name: 'twitter:card', content: 'summary_large_image' },
      {
        name: 'twitter:title',
        content:
          'アサトモ｜目覚ましを止めるだけで、大切な人に「今日も元気」が伝わる',
      },
      {
        name: 'twitter:description',
        content:
          '一人暮らしの朝を、誰かがゆるく知ってる安心。見張るのではなく、そっと寄り添う見守りです。',
      },
      { name: 'twitter:image', content: 'https://asatomo.nafuda.me/ogp.png' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      // PWA マニフェスト（ADR-0010: インストール可能・オフライン非対応）
      { rel: 'manifest', href: '/manifest.webmanifest' },
      // ファビコン（public/。元画像は android/art/icon-source-sun-heart.jpeg）
      { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '32x32',
        href: '/favicon-32.png',
      },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '16x16',
        href: '/favicon-16.png',
      },
      {
        rel: 'apple-touch-icon',
        sizes: '180x180',
        href: '/apple-touch-icon.png',
      },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <HeadContent />
        {/* PWA: OS のツールバー色。ヘッダー背景に合わせ、dark はメディアクエリで上書き。 */}
        <meta
          name="theme-color"
          content="#f4f7fb"
          media="(prefers-color-scheme: light)"
        />
        <meta
          name="theme-color"
          content="#14171f"
          media="(prefers-color-scheme: dark)"
        />
        {/* iOS の「ホーム画面に追加」を standalone で開くための宣言。 */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="アサトモWeb" />
        {/* beforeinstallprompt はハイドレーション前に発火するため早期キャプチャ
            （usePwaInstall が window.__pwaPrompt を読む。ADR-0010）。 */}
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: 早期実行のインラインが必要
          dangerouslySetInnerHTML={{
            __html:
              "window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__pwaPrompt=e;});",
          }}
        />
      </head>
      <body>
        {children}
        <Scripts />
        {/* サービスワーカー登録（ADR-0010: network-only の最小SW）。 */}
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: SW 登録のインラインが必要
          dangerouslySetInnerHTML={{
            __html:
              "if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(function(){});});}",
          }}
        />
      </body>
    </html>
  );
}
