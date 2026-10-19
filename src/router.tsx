import { createRouter } from '@tanstack/react-router';
import { getGlobalStartContext } from '@tanstack/react-start';
import { Spinner } from './components/ui/spinner';
import { routeTree } from './routeTree.gen';

/**
 * ルート遷移中のローディング表示。未設定だと、モバイルの遅い回線でローダー（server 関数）
 * 完了まで空画面（ダーク背景だけ）になり「真っ黒で壊れた感じ」に見える。ヘッダー/下タブは
 * _app レイアウト側に残り、この中身だけが Outlet 内に出る。
 */
function RoutePending() {
  return (
    <div className="grid min-h-[50vh] place-items-center bg-background">
      <Spinner className="size-8 text-muted-foreground" />
    </div>
  );
}

/**
 * TanStack Start が要求するルーターファクトリ（リクエスト/クライアントごとに生成）。
 * ssr.nonce: src/start.ts のCSPミドルウェアがリクエストごとに発行したnonceを
 * getGlobalStartContext() 経由で受け取る（サーバーのみ。クライアントでは常にundefinedを
 * 返す実装のため安全）。Reactのストリーミングレンダラー・<meta property="csp-nonce">・
 * TanStack Start内部のハイドレーションスクリプトの3箇所に自動で配線される。
 */
export function getRouter() {
  return createRouter({
    routeTree,
    ssr: { nonce: getGlobalStartContext()?.nonce },
    scrollRestoration: true,
    defaultPreload: 'intent',
    // 遷移が 150ms を超えたらローディングを出す（速い遷移では出さずチラつかせない）。
    // 一度出たら最低 400ms は表示して素早い明滅を防ぐ。
    defaultPendingComponent: RoutePending,
    defaultPendingMs: 150,
    defaultPendingMinMs: 400,
    // 直近に開いたタブは10秒間は再取得せず即表示（モバイルでの切り替えを軽くする）。
    defaultStaleTime: 10_000,
  });
}
