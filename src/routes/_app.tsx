import {
  createFileRoute,
  Outlet,
  redirect,
  useLocation,
} from '@tanstack/react-router';
import { useEffect } from 'react';
import { fetchShell } from '../server/functions';
import { identify } from '../web/analytics';
import { BottomTabs } from '../web/BottomTabs';
import { BrandHeader } from '../web/BrandHeader';
import { activeTab } from '../web/nav';
import { PwaInstallBanner } from '../web/PwaInstallBanner';

/**
 * ログイン後の共通レイアウト（URL に寄与しないパスレスの枠。ADR-0008 §実装決定1）。
 * 認証・設定ガードの一元化と、ブランドヘッダー＋下タブの共通描画を担う。
 *
 *   - 未設定（サーバー env 未整備）→ ランディング `/` へ（そこで案内を出す）。
 *   - 未ログイン → `/login` へ（元の場所を redirect で連れ帰る。ADR-0008 §実装決定4）。
 *     これで、各ページが個別に描いていた「ログインが必要です → ← トップへ」を廃し、
 *     `/` をランディング化しても行き止まりが生まれない。
 *   - 下タブは activeTab が非 null の画面（わたし・仲間・伝言 系）だけに出す。
 *     /account 等の管理系はヘッダーのみ（決定5）。
 */
export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ location }) => {
    const shell = await fetchShell();
    if (shell.status === 'unconfigured') throw redirect({ to: '/' });
    if (shell.status === 'signed_out')
      throw redirect({ to: '/login', search: { redirect: location.pathname } });
    return { user: shell.user };
  },
  component: AppLayout,
});

function AppLayout() {
  const { pathname } = useLocation();
  const tab = activeTab(pathname);
  // ログイン中のユーザーを解析にひも付ける（idのみ。以降のイベントが同一人物に紐づく）。
  const { user } = Route.useRouteContext();
  useEffect(() => {
    if (user?.id) identify(user.id);
  }, [user?.id]);
  return (
    <div className="min-h-screen bg-background">
      <BrandHeader />
      <PwaInstallBanner />
      <main className={tab ? 'pb-19' : ''}>
        <Outlet />
      </main>
      {tab ? <BottomTabs active={tab} /> : null}
    </div>
  );
}
