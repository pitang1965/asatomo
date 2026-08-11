import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import type { WatchedSubjectImpact } from '../domain/account';
import { fetchAccountDeletePreview } from '../server/functions';
import { authClient } from '../web/auth-client';

/**
 * アカウント削除の確認画面（/account/delete。ADR-0007）。
 *
 * 安全の要（grill 2026-07-21）: 削除は即時・不可逆。誤削除への防御は「可逆性」ではなく
 * 「情報つきの摩擦」で与える。ここで、あなたが抜けることで網が縮む本人ごとの結果
 * （0人になる / 開示ラインを割る）を事前に見せる。最終確認はチェックボックス1つ＋赤い実行ボタン。
 *
 * ファイル名は account_.delete.tsx（親セグメントの末尾 `_`）。これで /account レイアウトの
 * 入れ子から外れ、独立フルページになる。account.tsx は Outlet を持たないため、入れ子のままだと
 * /account/delete が描画されない（＝「押しても何も起きない」）。URL は /account/delete のまま。
 */
export const Route = createFileRoute('/_app/account_/delete')({
  loader: () => fetchAccountDeletePreview(),
  component: DeletePage,
});

// カードのレイアウト（見た目は Card 部品が持つ）。maxWidth480 + padding20×2 = 520px ＝ max-w-130。
const cardW = 'mx-auto my-4 max-w-130';

function DeletePage() {
  const data = Route.useLoaderData();

  if (data.status === 'unconfigured')
    return <Center title="サーバーが未設定です" body={data.message} />;
  if (data.status === 'signed_out')
    return (
      <Center
        title="ログインが必要です"
        body="アカウントの削除は、ご本人のアカウントでログインして行います。"
      />
    );

  return <Confirm preview={data.preview} />;
}

function impactLine(s: WatchedSubjectImpact): {
  text: string;
  strong: boolean;
} {
  if (s.leavesEmpty)
    return {
      text: `${s.subjectName}さんの見守りが0人になります（誰も見守れなくなります）。`,
      strong: true,
    };
  if (s.dropsBelowDisclosureLine)
    return {
      text: `${s.subjectName}さんは見守り者が${s.currentLivingWatchers}人→${s.resultingLivingWatchers}人になり、そのままだと最後の伝言を届けられなくなります。`,
      strong: true,
    };
  return {
    text: `${s.subjectName}さんの見守り者が${s.currentLivingWatchers}人→${s.resultingLivingWatchers}人になります。`,
    strong: false,
  };
}

function Confirm({
  preview,
}: {
  preview: {
    watchedSubjects: WatchedSubjectImpact[];
    watchersOnYou: number;
  };
}) {
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function execute() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) throw new Error(`delete failed: ${res.status}`);
      // セッションはサーバー側で消えている。クライアントの Cookie も念のためクリア。
      await authClient.signOut().catch(() => {});
      setDone(true);
    } catch {
      setError('うまくいきませんでした。時間をおいてお試しください。');
      setBusy(false);
    }
  }

  if (done)
    return (
      <Center
        title="削除が完了しました"
        body="アサトモのアカウントとデータを削除しました。これまでご利用いただき、ありがとうございました。"
      />
    );

  const { watchedSubjects, watchersOnYou } = preview;

  return (
    <div className="min-h-screen bg-background">
      <div className="px-4 py-2.5 text-[13px]">
        <Link to="/account" className="text-primary hover:underline">
          ← もどる
        </Link>
      </div>

      <Card className={cardW}>
        <h1 className="m-0 text-lg text-foreground">
          アカウントを削除しますか？
        </h1>
        <p className="mt-2.5 text-[13px] leading-[1.9] text-muted-foreground">
          削除は<strong>すぐに反映され、元に戻せません</strong>。
          あなたが用意した最後の伝言と宛先も削除されます。
        </p>

        {watchedSubjects.length > 0 ? (
          <div className="mt-4 rounded-xl bg-(--danger-soft) px-3.5 py-3">
            <p className="m-0 text-xs font-bold text-foreground">
              あなたが見守っている人への影響
            </p>
            <ul className="mt-2 flex list-none flex-col gap-1.5 pl-4.5">
              {watchedSubjects.map((s) => {
                const { text, strong } = impactLine(s);
                return (
                  <li
                    key={s.subjectUserId}
                    className={cn(
                      'text-[13px] leading-[1.7] text-foreground',
                      strong ? 'font-bold' : 'font-normal',
                    )}
                  >
                    {text}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {watchersOnYou > 0 ? (
          <p className="mt-3.5 text-[13px] leading-[1.8] text-muted-foreground">
            あなたを見守ってくれている{watchersOnYou}
            人には、「利用をやめた」ことをお知らせします。
          </p>
        ) : null}

        <label className="mt-4.5 flex cursor-pointer items-start gap-2.5 text-[13px] leading-[1.7] text-foreground">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.75 size-4.5 shrink-0"
          />
          <span>
            上記を理解し、アカウントとデータを完全に削除することに同意します。
          </span>
        </label>

        {error ? (
          <p className="mt-3 text-[13px] text-(--danger)">{error}</p>
        ) : null}

        {/* 「やめておく」を先・実ボタンで（取り消せない操作では安全な出口を目立たせる）。
            削除は下・赤だがチェックボックスで守られているので目立ってよい。 */}
        <Button
          asChild
          variant="secondary"
          className="mt-4 h-auto w-full rounded-xl border border-border py-3.25 text-[15px] font-bold"
        >
          <Link to="/account">やめておく</Link>
        </Button>

        <button
          type="button"
          onClick={execute}
          disabled={!agreed || busy}
          aria-busy={busy}
          className={cn(
            'mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl border-0 py-3.25 text-[15px] font-bold',
            agreed
              ? 'cursor-pointer bg-(--danger) text-white'
              : 'cursor-not-allowed bg-secondary text-(--ink-3)',
            busy && 'opacity-70',
          )}
        >
          {busy && <Spinner />}
          {busy ? '削除しています…' : 'アカウントを削除する'}
        </button>
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
      </Card>
    </div>
  );
}
