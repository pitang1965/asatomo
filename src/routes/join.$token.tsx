import { createFileRoute, Link } from '@tanstack/react-router';
import { type CSSProperties, useState } from 'react';
import { fetchInvitePreview } from '../server/functions';
import { authClient } from '../web/auth-client';

/**
 * 招待の承諾ランディング（ADR-0005）。まだアカウントの無い相手でも踏める入口。
 *   未ログイン → 「◯◯さんが見守り合いに誘っています」＋ログイン（この画面へ戻す）
 *   ログイン済み → 「見守り合う」/「見守るだけ」を選んで /api/invitations/accept
 * 罪悪感を誘わない文言（ADR-0004 §4）。承諾は相互がデフォルト、片務も選べる。
 */
export const Route = createFileRoute('/join/$token')({
  loader: ({ params }) => fetchInvitePreview({ data: { token: params.token } }),
  component: JoinPage,
});

const page: CSSProperties = {
  background: 'var(--bg)',
  minHeight: '100vh',
  fontFamily: 'var(--font-jp)',
  display: 'grid',
  placeItems: 'center',
  padding: 24,
};

const card: CSSProperties = {
  background: 'var(--surface)',
  borderRadius: 20,
  padding: '32px 28px',
  maxWidth: 400,
  width: '100%',
  boxShadow: '0 8px 32px rgb(0 0 0 / 0.08)',
  textAlign: 'center',
};

const btn: CSSProperties = {
  appearance: 'none',
  border: '1px solid var(--line)',
  cursor: 'pointer',
  font: 'inherit',
  display: 'block',
  width: '100%',
  padding: '12px 16px',
  borderRadius: 12,
  fontWeight: 600,
  fontSize: 14,
  background: 'var(--surface-2)',
  color: 'var(--ink)',
  marginTop: 10,
};

const primaryBtn: CSSProperties = {
  ...btn,
  background: 'var(--accent)',
  color: '#fff',
  border: 0,
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={page}>
      <div style={card}>{children}</div>
    </div>
  );
}

const INVALID_COPY: Record<string, { title: string; body: string }> = {
  not_found: {
    title: 'リンクが見つかりません',
    body: 'この招待リンクは見つかりませんでした。URLをもう一度ご確認ください。',
  },
  expired: {
    title: 'リンクの期限が切れています',
    body: 'この招待リンクは有効期限が切れています。招待した方に、もう一度リンクを送ってもらってください。',
  },
  consumed: {
    title: 'このリンクは使用済みです',
    body: 'この招待リンクはすでに使われています。新しいリンクを送ってもらってください。',
  },
  revoked: {
    title: 'この招待は取り消されました',
    body: '招待した方がこの招待を取り消しました。',
  },
};

function JoinPage() {
  const data = Route.useLoaderData();
  const { token } = Route.useParams();
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<null | { mutual: boolean }>(null);
  const [error, setError] = useState('');

  if (data.status === 'unconfigured')
    return (
      <Shell>
        <h1 style={{ fontSize: 18, color: 'var(--ink)' }}>
          サーバーが未設定です
        </h1>
        <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.8 }}>
          {data.message}
        </p>
      </Shell>
    );

  if (data.status === 'invalid') {
    const c = INVALID_COPY[data.reason] ?? INVALID_COPY.not_found;
    return (
      <Shell>
        <p style={{ fontSize: 26, marginBottom: 4 }} aria-hidden>
          🌥️
        </p>
        <h1 style={{ fontSize: 18, color: 'var(--ink)' }}>{c.title}</h1>
        <p
          style={{
            fontSize: 13,
            color: 'var(--ink-2)',
            lineHeight: 1.8,
            marginTop: 8,
          }}
        >
          {c.body}
        </p>
      </Shell>
    );
  }

  const { inviterName, signedIn, isSelf } = data;

  if (done)
    return (
      <Shell>
        <p style={{ fontSize: 26, marginBottom: 4 }} aria-hidden>
          🌅
        </p>
        <h1 style={{ fontSize: 18, color: 'var(--ink)' }}>つながりました</h1>
        <p
          style={{
            fontSize: 13,
            color: 'var(--ink-2)',
            lineHeight: 1.8,
            marginTop: 8,
          }}
        >
          {done.mutual
            ? `${inviterName}さんと見守り合いを始めました。おたがいの「今日も元気」がそっと伝わります。`
            : `${inviterName}さんの見守りに加わりました。`}
        </p>
        <div style={{ marginTop: 20 }}>
          <Link to="/" style={{ ...primaryBtn, textDecoration: 'none' }}>
            見守りページへ
          </Link>
        </div>
      </Shell>
    );

  if (isSelf)
    return (
      <Shell>
        <h1 style={{ fontSize: 18, color: 'var(--ink)' }}>
          あなた自身の招待リンクです
        </h1>
        <p
          style={{
            fontSize: 13,
            color: 'var(--ink-2)',
            lineHeight: 1.8,
            marginTop: 8,
          }}
        >
          このリンクを見守ってほしい相手に送ってください。
        </p>
        <div style={{ marginTop: 20 }}>
          <Link to="/" style={{ color: 'var(--accent)' }}>
            ← 見守りページへ戻る
          </Link>
        </div>
      </Shell>
    );

  if (!signedIn)
    return (
      <Shell>
        <p style={{ fontSize: 26, marginBottom: 4 }} aria-hidden>
          🤝
        </p>
        <h1 style={{ fontSize: 20, color: 'var(--ink)' }}>
          {inviterName}さんが
          <br />
          見守り合いに誘っています
        </h1>
        <p
          style={{
            fontSize: 13,
            color: 'var(--ink-2)',
            lineHeight: 1.8,
            marginTop: 8,
          }}
        >
          見守り合うと、おたがいの「今日も元気」がそっと伝わります。
          <br />
          まずはお使いのアカウントでログインしてください。
        </p>
        <div style={{ marginTop: 20 }}>
          <button
            type="button"
            style={btn}
            onClick={() =>
              authClient.signIn.social({
                provider: 'google',
                callbackURL: `/join/${token}`,
              })
            }
          >
            Google でログイン
          </button>
          <button
            type="button"
            style={btn}
            onClick={() =>
              authClient.signIn.social({
                provider: 'facebook',
                callbackURL: `/join/${token}`,
              })
            }
          >
            Facebook でログイン
          </button>
          <button
            type="button"
            style={btn}
            onClick={() =>
              authClient.signIn.oauth2({
                providerId: 'line',
                callbackURL: `/join/${token}`,
              })
            }
          >
            LINE でログイン
          </button>
        </div>
      </Shell>
    );

  async function accept(mutual: boolean) {
    setPending(true);
    setError('');
    try {
      const res = await fetch('/api/invitations/accept', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, mutual }),
      });
      if (!res.ok) throw new Error(`accept failed: ${res.status}`);
      setDone({ mutual });
    } catch {
      setError('うまくいきませんでした。時間をおいてもう一度お試しください。');
    } finally {
      setPending(false);
    }
  }

  return (
    <Shell>
      <p style={{ fontSize: 26, marginBottom: 4 }} aria-hidden>
        🤝
      </p>
      <h1 style={{ fontSize: 20, color: 'var(--ink)' }}>
        {inviterName}さんが
        <br />
        見守り合いに誘っています
      </h1>
      <p
        style={{
          fontSize: 13,
          color: 'var(--ink-2)',
          lineHeight: 1.8,
          marginTop: 8,
        }}
      >
        「見守り合う」を選ぶと、あなたが{inviterName}さんを見守り、
        {inviterName}さんもあなたを見守ります。急かし合うものではなく、
        ゆるく「元気そう」を知り合うだけです。
      </p>
      {error ? (
        <p style={{ color: 'var(--bad, #b14)', fontSize: 13, marginTop: 12 }}>
          {error}
        </p>
      ) : null}
      <div style={{ marginTop: 20 }}>
        <button
          type="button"
          style={primaryBtn}
          disabled={pending}
          onClick={() => accept(true)}
        >
          見守り合う
        </button>
        <button
          type="button"
          style={btn}
          disabled={pending}
          onClick={() => accept(false)}
        >
          今は見守るだけにする
        </button>
      </div>
      <p
        style={{
          fontSize: 12,
          color: 'var(--ink-2)',
          lineHeight: 1.7,
          marginTop: 14,
        }}
      >
        「見守るだけ」でも、あとから見守り合いに切り替えられます。
      </p>
    </Shell>
  );
}
