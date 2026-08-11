import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-background p-6">
      {/* カード外枠は旧 content-box 実測（maxWidth400 + 左右padding28×2 = 456px）＝max-w-114。 */}
      <div className="w-full max-w-114 rounded-[20px] bg-card px-7 py-8 text-center shadow-[0_8px_32px_rgb(0_0_0/0.08)]">
        {children}
      </div>
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
  // 承諾中はどちらのボタンを押したかを保持し、そのボタンにスピナーを出す（null = 未承諾）。
  const [accepting, setAccepting] = useState<'mutual' | 'watch' | null>(null);
  // ログインは押下→プロバイダ遷移まで無反応の間があるので、その間スピナーを出す。
  const [signingIn, setSigningIn] = useState<'google' | 'line' | null>(null);
  const [done, setDone] = useState<null | { mutual: boolean }>(null);
  const [error, setError] = useState('');

  if (data.status === 'unconfigured')
    return (
      <Shell>
        <h1 className="text-lg text-foreground">サーバーが未設定です</h1>
        <p className="text-[13px] leading-[1.8] text-muted-foreground">
          {data.message}
        </p>
      </Shell>
    );

  if (data.status === 'invalid') {
    const c = INVALID_COPY[data.reason] ?? INVALID_COPY.not_found;
    return (
      <Shell>
        <p className="mb-1 text-[26px]" aria-hidden>
          🌥️
        </p>
        <h1 className="text-lg text-foreground">{c.title}</h1>
        <p className="mt-2 text-[13px] leading-[1.8] text-muted-foreground">
          {c.body}
        </p>
      </Shell>
    );
  }

  const { inviterName, signedIn, isSelf } = data;

  if (done)
    return (
      <Shell>
        <img
          src="/apple-touch-icon.png"
          alt=""
          aria-hidden
          width={56}
          height={56}
          className="mx-auto mb-2 block rounded-xl"
        />
        <h1 className="text-lg text-foreground">つながりました</h1>
        <p className="mt-2 text-[13px] leading-[1.8] text-muted-foreground">
          {done.mutual
            ? `${inviterName}さんと見守り合いを始めました。おたがいの「今日も元気」がそっと伝わります。`
            : `${inviterName}さんの見守りに加わりました。`}
        </p>
        <div className="mt-5">
          <Button
            asChild
            size="lg"
            className="h-auto w-full py-3 font-semibold"
          >
            <Link to="/">見守りページへ</Link>
          </Button>
        </div>
      </Shell>
    );

  if (isSelf)
    return (
      <Shell>
        <h1 className="text-lg text-foreground">あなた自身の招待リンクです</h1>
        <p className="mt-2 text-[13px] leading-[1.8] text-muted-foreground">
          このリンクを見守ってほしい相手に送ってください。
        </p>
        <div className="mt-5">
          <Link to="/" className="text-primary hover:underline">
            ← 見守りページへ戻る
          </Link>
        </div>
      </Shell>
    );

  if (!signedIn)
    return (
      <Shell>
        <p className="mb-1 text-[26px]" aria-hidden>
          🤝
        </p>
        <h1 className="text-xl text-foreground">
          {inviterName}さんが
          <br />
          見守り合いに誘っています
        </h1>
        <p className="mt-2 text-[13px] leading-[1.8] text-muted-foreground">
          見守り合うと、おたがいの「今日も元気」がそっと伝わります。
          <br />
          まずはお使いのアカウントでログインしてください。
        </p>
        <div className="mt-5 flex flex-col gap-2.5">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="w-full border border-border font-semibold"
            disabled={signingIn !== null}
            aria-busy={signingIn === 'google'}
            onClick={() => signInWith('google')}
          >
            {signingIn === 'google' && <Spinner />}
            {signingIn === 'google' ? 'ログイン中…' : 'Google でログイン'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="w-full border border-border font-semibold"
            disabled={signingIn !== null}
            aria-busy={signingIn === 'line'}
            onClick={() => signInWith('line')}
          >
            {signingIn === 'line' && <Spinner />}
            {signingIn === 'line' ? 'ログイン中…' : 'LINE でログイン'}
          </Button>
          {/* Facebook は未実装（backlog 項目17）のため一時的に非表示。
              /login と同じ方針で揃える。実装時に下記を復活させる:
                authClient.signIn.social({ provider: 'facebook', callbackURL: `/join/${token}` }) */}
        </div>
        <p className="mt-4 text-balance text-[11px] leading-[1.7] text-muted-foreground/80">
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
      </Shell>
    );

  async function signInWith(provider: 'google' | 'line') {
    if (signingIn) return; // 二重押下・別プロバイダの同時押しを防ぐ
    setSigningIn(provider);
    const callbackURL = `/join/${token}`;
    try {
      if (provider === 'google') {
        await authClient.signIn.social({ provider: 'google', callbackURL });
      } else {
        await authClient.signIn.oauth2({ providerId: 'line', callbackURL });
      }
    } catch {
      // リダイレクトに至らなかった場合だけ操作可能に戻す。
      setSigningIn(null);
    }
  }

  async function accept(mutual: boolean) {
    if (accepting) return; // 二重送信・両ボタン同時押しを防ぐ
    setAccepting(mutual ? 'mutual' : 'watch');
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
      setAccepting(null);
    }
  }

  return (
    <Shell>
      <p className="mb-1 text-[26px]" aria-hidden>
        🤝
      </p>
      <h1 className="text-xl text-foreground">
        {inviterName}さんが
        <br />
        見守り合いに誘っています
      </h1>
      <p className="mt-2 text-[13px] leading-[1.8] text-muted-foreground">
        「見守り合う」を選ぶと、あなたが{inviterName}さんを見守り、
        {inviterName}さんもあなたを見守ります。急かし合うものではなく、
        ゆるく「元気そう」を知り合うだけです。
      </p>
      {error ? (
        <p className="mt-3 text-[13px] text-destructive">{error}</p>
      ) : null}
      <div className="mt-5 flex flex-col gap-2.5">
        <Button
          type="button"
          size="lg"
          className="h-auto w-full py-3 font-semibold"
          disabled={accepting !== null}
          aria-busy={accepting === 'mutual'}
          onClick={() => accept(true)}
        >
          {accepting === 'mutual' && <Spinner />}
          {accepting === 'mutual' ? '送信中…' : '見守り合う'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="lg"
          className="w-full border border-border font-semibold"
          disabled={accepting !== null}
          aria-busy={accepting === 'watch'}
          onClick={() => accept(false)}
        >
          {accepting === 'watch' && <Spinner />}
          {accepting === 'watch' ? '送信中…' : '今は見守るだけにする'}
        </Button>
      </div>
      <p className="mt-3.5 text-xs leading-[1.7] text-muted-foreground">
        「見守るだけ」でも、あとから見守り合いに切り替えられます。
      </p>
    </Shell>
  );
}
