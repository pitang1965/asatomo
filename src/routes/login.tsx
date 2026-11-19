import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { fetchShell } from '../server/functions';
import { track } from '../web/analytics';
import { authClient } from '../web/auth-client';
import { InAppBrowserNotice } from '../web/InAppBrowserNotice';

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

function LoginPage() {
  const { redirect: back = '/' } = Route.useSearch();

  // 押下からプロバイダへ遷移するまで無反応の間があるので、その間ボタンにスピナーを出す。
  // 遷移が成功すればページごと離れるので解除は不要。失敗時のみ catch で元に戻す。
  const [pending, setPending] = useState<'google' | 'line' | null>(null);

  async function signInWith(provider: 'google' | 'line') {
    if (pending) return; // 二重押下・別プロバイダの同時押しを防ぐ
    setPending(provider);
    track('login_started', { provider });
    try {
      if (provider === 'google') {
        await authClient.signIn.social({
          provider: 'google',
          callbackURL: back,
        });
      } else {
        await authClient.signIn.oauth2({
          providerId: 'line',
          callbackURL: back,
        });
      }
    } catch {
      // リダイレクトに至らなかった場合だけ操作可能に戻す。
      setPending(null);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background p-6">
      {/* 外枠幅は master と同一に保つ。旧実装は content-box で maxWidth:380 + 左右
          パディング 28px×2 が外側に付き、外枠は実質 436px だった。Tailwind の
          Preflight で box-sizing:border-box になったため、同じ見た目にするには
          パディング込みの 436px を指定する（380 + 28×2）。 */}
      <div className="w-full max-w-109 rounded-[20px] bg-card px-7 py-8 text-center shadow-[0_8px_32px_rgb(0_0_0/0.08)]">
        <img
          src="/apple-touch-icon.png"
          alt=""
          aria-hidden
          width={56}
          height={56}
          className="mx-auto mb-2 block rounded-xl"
        />
        <h1 className="text-xl text-foreground">アサトモWeb</h1>
        <p className="mt-2 text-[13px] leading-[1.8] text-muted-foreground">
          大切な人の「今日も元気」を、そっと見守るページです。
          <br />
          お使いのアカウントでログインしてください。
        </p>
        <InAppBrowserNotice />
        <div className="mt-5 flex flex-col gap-2.5">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="w-full border border-border font-semibold"
            disabled={pending !== null}
            aria-busy={pending === 'google'}
            onClick={() => signInWith('google')}
          >
            {pending === 'google' && <Spinner />}
            {pending === 'google' ? 'ログイン中…' : 'Google でログイン'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="w-full border border-border font-semibold"
            disabled={pending !== null}
            aria-busy={pending === 'line'}
            onClick={() => signInWith('line')}
          >
            {pending === 'line' && <Spinner />}
            {pending === 'line' ? 'ログイン中…' : 'LINE でログイン'}
          </Button>
          {/* Facebook は未実装（backlog 項目17）のため一時的に非表示。
              実装時に、下記のボタンを復活させる:
                authClient.signIn.social({ provider: 'facebook', callbackURL: back }) */}
        </div>
        {/* メールアドレス取得の明示（通知・利用目的・同意を1画面に集約）。
            LINE のメールアドレス取得権限審査で提出するスクショの根拠になる。
            2文を別段落に分け、それぞれ text-balance で行長を均等化する（同一段落だと
            後半の法務文の最終行に「す。」だけが孤立するため）。 */}
        <p className="mt-4 text-balance text-[11px] leading-[1.7] text-muted-foreground/80">
          ログイン時に、お名前・メールアドレス・プロフィール画像を取得し、アカウント作成・本人確認に利用します。
        </p>
        <p className="mt-1.5 text-balance text-[11px] leading-[1.7] text-muted-foreground/80">
          ログインすることで、
          <Link to="/terms" className="text-primary hover:underline">
            利用規約
          </Link>
          と
          <Link to="/privacy" className="text-primary hover:underline">
            プライバシーポリシー
          </Link>
          に同意したものとみなします。
        </p>
        <p className="mt-4 text-xs">
          <Link to="/preview" className="text-primary hover:underline">
            ログインせずにデモ画面を見る →
          </Link>
        </p>
        {/* ログアウト直後の着地点。ここから素の URL を手打ちしなくてもトップ
            （未ログインのランディング）へ戻れるように（行き止まり解消）。 */}
        <p className="mt-2.5 text-xs">
          <Link to="/" className="text-muted-foreground hover:underline">
            アサトモWebについて →
          </Link>
        </p>
      </div>
    </div>
  );
}
