import {
  createFileRoute,
  Outlet,
  redirect,
  useLocation,
} from '@tanstack/react-router';
import { fetchShell } from '../server/functions';
import { BottomTabs } from '../web/BottomTabs';
import { BrandHeader } from '../web/BrandHeader';
import { activeTab } from '../web/nav';

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
  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <BrandHeader />
      <main style={{ paddingBottom: tab ? 76 : 0 }}>
        <Outlet />
      </main>
      {tab ? <BottomTabs active={tab} /> : null}
    </div>
  );
}
