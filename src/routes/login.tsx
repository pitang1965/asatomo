import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import type { CSSProperties } from 'react';
import { fetchShell } from '../server/functions';
import { authClient } from '../web/auth-client';

/**
 * ログイン画面（/login）。ADR-0008（トップはランディング、ログインは分離）に伴い、
 * 旧 `/` に埋め込まれていたログインカードをここへ切り出した独立ページ。
 *
 * `redirect` 検索パラメータ = ログイン後に戻す先（_app ガードが弾いた元の場所）。
 * 既にログイン済みでここへ来たら、その場でその先へ送る（ログイン画面を素通し）。
 */
export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    // オープンリダイレクト防止: 自サイト内の絶対パスのみ許可（//evil.com 等は弾く）。
    redirect:
      typeof search.redirect === 'string' &&
      search.redirect.startsWith('/') &&
      !search.redirect.startsWith('//')
        ? search.redirect
        : undefined,
  }),
  beforeLoad: async ({ search }) => {
    const shell = await fetchShell();
    if (shell.status === 'ok') throw redirect({ href: search.redirect ?? '/' });
  },
  component: LoginPage,
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
  maxWidth: 380,
  width: '100%',
  boxShadow: '0 8px 32px rgb(0 0 0 / 0.08)',
  textAlign: 'center',
};

function LoginPage() {
  const { redirect: back = '/' } = Route.useSearch();

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
        <h1 style={{ fontSize: 20, color: 'var(--ink)' }}>
          アサトモ 見守りWeb
        </h1>
        <p
          style={{
            fontSize: 13,
            color: 'var(--ink-2)',
            lineHeight: 1.8,
            marginTop: 8,
          }}
        >
          大切な人の「今日も元気」を、そっと見守るページです。
          <br />
          お使いのアカウントでログインしてください。
        </p>
        <div style={{ marginTop: 20 }}>
          <button
            type="button"
            style={btn}
            onClick={() =>
              authClient.signIn.social({
                provider: 'google',
                callbackURL: back,
              })
            }
          >
            Google でログイン
          </button>
          {/* Facebook / LINE は未実装（backlog 項目17）のため一時的に非表示。
              押しても失敗する導線を出さない（クローズドテストの第一印象を損ねないため）。
              実装時に、下記のボタンを復活させる:
                authClient.signIn.social({ provider: 'facebook', callbackURL: back })
                authClient.signIn.oauth2({ providerId: 'line', callbackURL: back }) */}
        </div>
        <p style={{ marginTop: 20, fontSize: 12 }}>
          <Link to="/preview" style={{ color: 'var(--accent)' }}>
            ログインせずに画面プレビューを見る →
          </Link>
        </p>
      </div>
    </div>
  );
}
