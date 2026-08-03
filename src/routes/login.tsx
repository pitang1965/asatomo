import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { type CSSProperties, useEffect, useState } from 'react';
import { fetchShell } from '../server/functions';
import { authClient } from '../web/auth-client';

/**
 * アプリ内ブラウザ（WebView）判定。LINE・Instagram 等の中で開かれると Cookie が隔離され、
 * OAuth の state Cookie が戻り時に読めず「状態不一致」でログインが失敗する（Google も
 * 埋め込み WebView を disallowed_useragent で拒否する。業界共通の制約）。UA で既知の
 * アプリ内ブラウザを検知し、通常ブラウザで開き直すよう案内する。
 */
function isInAppBrowser(ua: string): boolean {
  return /\bLine\/|FBAN|FBAV|FB_IAB|Instagram|Twitter|TikTok|musical_ly|Bytedance|KAKAOTALK|MicroMessenger/i.test(
    ua,
  );
}

/**
 * ログイン画面（/login）。ADR-0008（トップはランディング、ログインは分離）に伴い、
 * 旧 `/` に埋め込まれていたログインカードをここへ切り出した独立ページ。
 *
 * `redirect` 検索パラメータ = ログイン後に戻す先（_app ガードが弾いた元の場所）。
 * 既にログイン済みでここへ来たら、その場でその先へ送る（ログイン画面を素通し）。
 */
export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    // オープンリダイレクト防止: 自サイト内の絶対パスのみ許可。
    // 先頭は '/'、2文字目は '/' でも '\' でもない（//evil.com・/\evil.com を弾く。
    // ブラウザは Location の '\' を '/' に正規化するため \ も別オリジンになりうる）。
    redirect:
      typeof search.redirect === 'string' && /^\/[^/\\]/.test(search.redirect)
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

  // アプリ内ブラウザ判定はクライアントでのみ行う（SSR に navigator が無い）。初期 false で
  // SSR と一致させ、マウント後に true へ切り替える（ハイドレーション不整合を避ける）。
  const [inApp, setInApp] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setInApp(isInAppBrowser(navigator.userAgent));
  }, []);

  const copyUrl = () => {
    const url = window.location.href;
    navigator.clipboard?.writeText(url).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => {
        // クリップボード不可の環境では選択できるよう prompt で提示。
        window.prompt(
          'このURLをコピーして、ChromeやSafariで開いてください',
          url,
        );
      },
    );
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
        <h1 style={{ fontSize: 20, color: 'var(--ink)' }}>アサトモWeb</h1>
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
        {inApp && (
          <div
            style={{
              marginTop: 16,
              padding: '12px 14px',
              borderRadius: 12,
              background: '#fff7ed',
              border: '1px solid #fdba74',
              color: '#9a3412',
              fontSize: 13,
              lineHeight: 1.7,
              textAlign: 'left',
            }}
          >
            <strong>アプリ内の画面で開かれています。</strong>
            <br />
            このままだとログイン（特にLINE）が「状態不一致」で失敗することがあります。右上のメニュー（⋮
            や … ）から
            <strong>「ブラウザで開く」/「既定のブラウザで開く」</strong>
            を選び、Chrome や Safari で開き直してください。
            <button
              type="button"
              onClick={copyUrl}
              style={{
                appearance: 'none',
                marginTop: 10,
                border: '1px solid #fdba74',
                background: '#fff',
                color: '#9a3412',
                borderRadius: 10,
                padding: '8px 12px',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                width: '100%',
              }}
            >
              {copied ? '✓ URLをコピーしました' : 'このページのURLをコピー'}
            </button>
          </div>
        )}
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
          <button
            type="button"
            style={btn}
            onClick={() =>
              authClient.signIn.oauth2({
                providerId: 'line',
                callbackURL: back,
              })
            }
          >
            LINE でログイン
          </button>
          {/* Facebook は未実装（backlog 項目17）のため一時的に非表示。
              実装時に、下記のボタンを復活させる:
                authClient.signIn.social({ provider: 'facebook', callbackURL: back }) */}
        </div>
        <p
          style={{
            marginTop: 16,
            fontSize: 11,
            color: 'var(--ink-3)',
            lineHeight: 1.7,
          }}
        >
          {/* メールアドレス取得の明示（通知・利用目的・同意を1画面に集約）。
              LINE のメールアドレス取得権限審査で提出するスクショの根拠になる。 */}
          ログイン時に、お名前・メールアドレス・プロフィール画像を取得し、アカウント作成・本人確認に利用します。
          <br />
          ログインすることで、
          <Link to="/terms" style={{ color: 'var(--accent)' }}>
            利用規約
          </Link>
          と
          <Link to="/privacy" style={{ color: 'var(--accent)' }}>
            プライバシーポリシー
          </Link>
          に同意したものとみなします。
        </p>
        <p style={{ marginTop: 16, fontSize: 12 }}>
          <Link to="/preview" style={{ color: 'var(--accent)' }}>
            ログインせずにデモ画面を見る →
          </Link>
        </p>
        {/* ログアウト直後の着地点。ここから素の URL を手打ちしなくてもトップ
            （未ログインのランディング）へ戻れるように（行き止まり解消）。 */}
        <p style={{ marginTop: 10, fontSize: 12 }}>
          <Link to="/" style={{ color: 'var(--ink-2)' }}>
            アサトモWebについて →
          </Link>
        </p>
      </div>
    </div>
  );
}
