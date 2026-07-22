import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { type CSSProperties, useState } from 'react';
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
export const Route = createFileRoute('/account')({
  loader: () => fetchAccount(),
  component: AccountPage,
});

const page: CSSProperties = {
  background: 'var(--bg)',
  minHeight: '100vh',
  fontFamily: 'var(--font-jp)',
};

const card: CSSProperties = {
  background: 'var(--surface)',
  borderRadius: 16,
  padding: 20,
  maxWidth: 480,
  margin: '16px auto',
  boxShadow: 'var(--shadow-sm)',
};

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
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await authClient.signOut();
      await router.invalidate();
      window.location.href = '/';
    } catch {
      setBusy(false);
    }
  }

  return (
    <div style={page}>
      <div style={{ padding: '10px 16px', fontSize: 13 }}>
        <Link to="/" style={{ color: 'var(--accent)' }}>
          ← もどる
        </Link>
      </div>

      <div style={card}>
        {/* プロフィール要約 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Avatar name={userName} image={userImage} size={56} />
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 700,
                color: 'var(--ink)',
              }}
            >
              {userName}
            </p>
            <p
              style={{
                margin: '2px 0 0',
                fontSize: 12,
                color: 'var(--ink-2)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {userEmail}
            </p>
          </div>
        </div>

        <hr
          style={{
            border: 0,
            borderTop: '1px solid var(--line)',
            margin: '20px 0',
          }}
        />

        <button
          type="button"
          onClick={logout}
          disabled={busy}
          style={{
            appearance: 'none',
            border: '1px solid var(--line)',
            cursor: 'pointer',
            width: '100%',
            padding: '12px 16px',
            borderRadius: 12,
            fontWeight: 600,
            fontSize: 14,
            background: 'var(--surface-2)',
            color: 'var(--ink)',
          }}
        >
          {busy ? 'ログアウト中…' : 'ログアウト'}
        </button>
      </div>

      {/* 削除は明確に区切って最下部へ。文言は率直に（ADR-0007。婉曲にしない）。 */}
      <div style={{ ...card, marginTop: 8 }}>
        <p
          style={{
            margin: 0,
            fontSize: 12,
            color: 'var(--ink-2)',
            lineHeight: 1.8,
          }}
        >
          アサトモの利用をやめ、アカウントと保存したデータを完全に削除します。
        </p>
        <Link
          to="/account/delete"
          style={{
            display: 'block',
            marginTop: 12,
            textAlign: 'center',
            padding: '12px 16px',
            borderRadius: 12,
            fontWeight: 600,
            fontSize: 14,
            border: '1px solid var(--danger)',
            color: 'var(--danger)',
            textDecoration: 'none',
          }}
        >
          アカウントを削除する
        </Link>
      </div>
    </div>
  );
}

function Center({ title, body }: { title: string; body: string }) {
  return (
    <div
      style={{ ...page, display: 'grid', placeItems: 'center', padding: 24 }}
    >
      <div style={{ ...card, textAlign: 'center' }}>
        <h1 style={{ fontSize: 18, color: 'var(--ink)', marginBottom: 12 }}>
          {title}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.8 }}>
          {body}
        </p>
        <p style={{ marginTop: 20, fontSize: 13 }}>
          <Link to="/" style={{ color: 'var(--accent)' }}>
            ← トップへ
          </Link>
        </p>
      </div>
    </div>
  );
}
