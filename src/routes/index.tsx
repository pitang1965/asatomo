import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import type { CSSProperties } from 'react';
import { fetchShell } from '../server/functions';

/**
 * ルート（/）。ADR-0008 で役割を分けた:
 *   - 未設定 → セットアップ案内
 *   - 未ログイン → 暫定ランディング（ログインは独立した /login へ誘導）
 *   - ログイン済み → 既定タブ /me へリダイレクト（ダッシュボードは /me・/watch へ移設済み）
 * ランディングは暫定・最小限。本格化は宣伝フェーズ（MEMORY の方針に従う）。
 */
export const Route = createFileRoute('/')({
  loader: async () => {
    const shell = await fetchShell();
    if (shell.status === 'ok') throw redirect({ to: '/me' });
    return shell;
  },
  component: Home,
});

function Home() {
  const data = Route.useLoaderData();
  if (data.status === 'unconfigured')
    return <SetupNotice message={data.message} />;
  return <Landing />;
}

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
  maxWidth: 380,
  width: '100%',
  boxShadow: '0 8px 32px rgb(0 0 0 / 0.08)',
  textAlign: 'center',
};

function SetupNotice({ message }: { message: string }) {
  return (
    <div style={page}>
      <div style={card}>
        <h1 style={{ fontSize: 18, color: 'var(--ink)', marginBottom: 12 }}>
          サーバーが未設定です
        </h1>
        <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.8 }}>
          {message}
        </p>
        <p style={{ marginTop: 20, fontSize: 13 }}>
          <Link to="/preview" style={{ color: 'var(--accent)' }}>
            設定なしで画面プレビューを見る →
          </Link>
        </p>
      </div>
    </div>
  );
}

/**
 * 未ログインのランディング（ADR-0008 §7・§実装決定4）。暫定・最小限（本格化は宣伝フェーズ）。
 * ログイン UI は持たず、独立した `/login` へ誘導するだけにとどめる。
 */
function Landing() {
  return (
    <div style={page}>
      <div style={card}>
        <img
          src="/apple-touch-icon.png"
          alt=""
          aria-hidden
          width={56}
          height={56}
          style={{ display: 'block', margin: '0 auto 8px', borderRadius: 12 }}
        />
        <h1 style={{ fontSize: 20, color: 'var(--ink)' }}>アサトモ</h1>
        <p
          style={{
            fontSize: 13,
            color: 'var(--ink-2)',
            lineHeight: 1.8,
            marginTop: 8,
          }}
        >
          大切な人の「今日も元気」を、そっと見守り合うためのサービスです。
        </p>
        <Link
          to="/login"
          style={{
            display: 'block',
            marginTop: 20,
            padding: '12px 16px',
            borderRadius: 12,
            fontWeight: 600,
            fontSize: 14,
            background: 'var(--accent)',
            color: '#fff',
            textDecoration: 'none',
          }}
        >
          ログインする
        </Link>
        <p style={{ marginTop: 16, fontSize: 12 }}>
          <Link to="/preview" style={{ color: 'var(--accent)' }}>
            ログインせずに画面プレビューを見る →
          </Link>
        </p>
      </div>
    </div>
  );
}
