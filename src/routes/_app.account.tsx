import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { fetchAccount } from '../server/functions';
import { Avatar } from '../web/Avatar';
import { authClient } from '../web/auth-client';

/**
 * アカウント画面（/account）。トップ右上のアバターから来る。
 *
 * 置き場所の決定（grill 2026-07-21 / ADR-0007）:
 *   - ログアウトはトップの一等地から、この一段奥へ畳む（日常操作ではない）。
 *   - アカウント削除はここを入口に、依存者ごとの結果を見せる確認（/account/delete）へ。
 *   - 削除は「まれで重いフロー」なので見守りWeb が唯一の実装（ADR-0006）。
 */
export const Route = createFileRoute('/_app/account')({
  loader: () => fetchAccount(),
  component: AccountPage,
});

// カードのレイアウト（見た目は Card 部品が持つ）。box-sizing:border-box のため外枠は
// 旧 content-box の実測（maxWidth480 + padding20×2 = 520px）に合わせて max-w-130。
const cardW = 'mx-auto max-w-130';

function AccountPage() {
  const data = Route.useLoaderData();

  if (data.status === 'unconfigured')
    return <Center title="サーバーが未設定です" body={data.message} />;
  if (data.status === 'signed_out')
    return (
      <Center
        title="ログインが必要です"
        body="アカウントの管理は、ご本人のアカウントでログインして行います。"
      />
    );

  return (
    <Account
      userName={data.userName}
      userEmail={data.userEmail}
      userImage={data.userImage}
    />
  );
}

function Account({
  userName,
  userEmail,
  userImage,
}: {
  userName: string;
  userEmail: string;
  userImage: string | null;
}) {
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    // signOut のレスポンスがセッションCookieを削除する。失敗しても（オフライン等）
    // ここで握り潰さず、必ず遷移まで進める（サーバー側がセッションの正）。
    try {
      await authClient.signOut();
    } catch {
      // ネットワーク不調など。下の遷移でサーバーが未ログインを確定させる。
    }
    // replace で /account を履歴から外す（戻る操作で bfcache の認証済み画面を復元させない）。
    // 遷移先は /login。no-store（worker.ts）と併せ、必ずサーバーの最新セッションで判定させる。
    window.location.replace('/login');
  }

  return (
    <div className="min-h-screen bg-background">
      <Card className={`${cardW} my-4`}>
        {/* プロフィール要約 */}
        <div className="flex items-center gap-3.5">
          <Avatar name={userName} image={userImage} size={56} />
          <div className="min-w-0">
            <p className="m-0 text-base font-bold text-foreground">
              {userName}
            </p>
            <p className="mt-0.5 mb-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-muted-foreground">
              {userEmail}
            </p>
          </div>
        </div>

        <hr className="my-5 border-0 border-t border-border" />

        <Button
          type="button"
          variant="secondary"
          onClick={logout}
          disabled={busy}
          className="h-auto w-full rounded-xl border border-border py-3 text-sm font-semibold"
        >
          {busy ? 'ログアウト中…' : 'ログアウト'}
        </Button>
      </Card>

      {/* 削除は明確に区切って最下部へ。文言は率直に（ADR-0007。婉曲にしない）。 */}
      <Card className={`${cardW} mt-2 mb-4`}>
        <p className="m-0 text-xs leading-[1.8] text-muted-foreground">
          アサトモの利用をやめ、アカウントと保存したデータを完全に削除します。
        </p>
        <Link
          to="/account/delete"
          className="mt-3 block rounded-xl border border-(--danger) px-4 py-3 text-center text-sm font-semibold text-(--danger)"
        >
          アカウントを削除する
        </Link>
      </Card>
    </div>
  );
}

function Center({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-background p-6">
      <Card className={`${cardW} text-center`}>
        <h1 className="mb-3 text-lg text-foreground">{title}</h1>
        <p className="text-[13px] leading-[1.8] text-muted-foreground">
          {body}
        </p>
        <p className="mt-5 text-[13px]">
          <Link to="/" className="text-primary hover:underline">
            ← トップへ
          </Link>
        </p>
      </Card>
    </div>
  );
}
