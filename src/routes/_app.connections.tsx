import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import type { SubjectWatcher } from '../domain/queries';
import { fetchConnectionsPage } from '../server/functions';
import { RowMenu } from '../web/RowMenu';

/**
 * つながり整理ページ（本人側）＝「今わたしを見守ってくれている人」の一覧と、
 * 各人への見守りのお願いをやめる導線。
 *
 * 置き場所の決定（grill 2026-07-21）:
 *   - Web トップは「あなたが見守っている人」の列。一字違いの逆向きリストを同居させない
 *     ため、この逆向き（あなたを見守ってくれている人）＋やめるは別ページに分ける。
 *   - 稀・管理的な操作なので Web に置く（ADR-0006。日常の Android には持ち込まない）。
 * 外す瞬間（決定B）: 常に確認。加えて、その1人で開示ライン（生存見守り者2人＝不変条件D）を
 *   割る場合だけ「最後の伝言を届けられなくなる」と結果を強めて警告する。
 * 外したあと（決定A）: 行は消える（一覧＝今見守ってくれている人）。再依頼は通常の招待に戻る。
 * 相手への通知（決定A）: しない（本人が当事者。CONTEXT.md 見守り解除の非対称を参照）。
 */
export const Route = createFileRoute('/_app/connections')({
  loader: () => fetchConnectionsPage(),
  component: ConnectionsPage,
});

// カードのレイアウト（見た目は Card 部品が持つ）。box-sizing:border-box のため外枠は
// 旧 content-box の実測（maxWidth560 + padding20×2 = 600px）に合わせて max-w-150。
const cardW = 'mx-auto my-4 max-w-150';

function ConnectionsPage() {
  const data = Route.useLoaderData();

  if (data.status === 'unconfigured')
    return <Center title="サーバーが未設定です" body={data.message} />;
  if (data.status === 'signed_out')
    return (
      <Center
        title="ログインが必要です"
        body="見守ってくれている人の確認・整理は、ご本人のアカウントで行います。"
      />
    );

  return <Roster initial={data.watchers} />;
}

function Roster({ initial }: { initial: SubjectWatcher[] }) {
  const [watchers, setWatchers] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  // 生存（休眠しきい値以内）の見守り者数。2人ちょうどのとき、その1人を外すと開示ラインを割る。
  const livingCount = watchers.filter((w) => w.isLiving).length;

  async function stopWatching(w: SubjectWatcher) {
    setBusyId(w.connectionId);
    setNotice('');
    try {
      const res = await fetch('/api/connections/revoke', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ connectionId: w.connectionId }),
      });
      if (!res.ok) throw new Error(`revoke failed: ${res.status}`);
      // 外したら一覧から消す（決定A）。
      setWatchers((prev) =>
        prev.filter((x) => x.connectionId !== w.connectionId),
      );
      setNotice(`${w.displayName}さんへの見守りのお願いをやめました。`);
    } catch {
      setNotice('うまくいきませんでした。時間をおいてお試しください。');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* 「わたし」配下のドリルダウン。下タブの「わたし」は既にアクティブ表示で
          「押せば戻れる」と気づきにくいので、明示的な戻り導線を置く（/activity と対称）。 */}
      <div className="mx-auto max-w-150 px-5 pt-4">
        <Link
          to="/me"
          className="text-[13px] text-muted-foreground no-underline hover:underline"
        >
          ← 自分の画面に戻る
        </Link>
      </div>
      <Card className="mx-auto mt-2 mb-4 max-w-150">
        <h1 className="m-0 text-[17px] text-foreground">
          あなたを見守ってくれている人
        </h1>
        <p className="mt-2 mb-0 text-xs leading-[1.8] text-muted-foreground">
          いま、あなたの「元気」を受け取ってくれている人です。お願いをやめると、
          その人にはあなたの様子が届かなくなります。
        </p>

        {notice ? (
          <p className="mt-3.5 mb-0 rounded-[10px] bg-(--good-soft) px-3 py-2.5 text-[13px] text-foreground">
            {notice}
          </p>
        ) : null}

        {watchers.length === 0 ? (
          <p className="mt-4 mb-0 text-[13px] leading-[1.8] text-muted-foreground">
            まだ、あなたを見守ってくれている人はいません。
            <br />
            トップの「見守り合いに誘う」から声をかけてみましょう。
          </p>
        ) : (
          <ul className="mt-3.5 mb-0 flex list-none flex-col gap-2.5 p-0">
            {watchers.map((w) => {
              // その1人が「生存」で、生存がちょうど2人なら、外すと開示ラインを割る。
              const willLock = w.isLiving && livingCount === 2;
              return (
                <li
                  key={w.connectionId}
                  className="flex items-center justify-between gap-2.5 rounded-xl border border-border bg-secondary py-2 pr-2 pl-3"
                >
                  {/* 休眠中（14日以上利用なし＝isLiving=false）は開示ラインの分母から外れる。
                      「わたし」の警告（生存＜2人）の理由が本人に分かるよう、その旨を名前に添える。 */}
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-semibold text-foreground">
                      {w.displayName}
                    </span>
                    {w.isLiving ? null : (
                      <span className="text-[11px] leading-[1.6] text-(--warn)">
                        しばらく利用がないようです。もしものとき気づいてもらえない
                        かもしれません。
                      </span>
                    )}
                  </div>
                  {/* 稀な操作なので⋮に畳む（grill フィードバック）。開示ラインを割る時だけ警告（決定B）。 */}
                  <RowMenu
                    actionLabel="見守りをお願いするのをやめる"
                    confirmLabel="やめる"
                    pending={busyId === w.connectionId}
                    onConfirm={() => stopWatching(w)}
                    confirmBody={
                      willLock ? (
                        <span className="block rounded-[10px] bg-(--warn-soft) px-3 py-2.5 text-foreground">
                          {w.displayName}さんへの見守りのお願いをやめると、
                          見守ってくれる人が少なくなり、そのままだと、あなたに
                          もしものことがあっても
                          <strong>最後の伝言を届けられません</strong>。
                          それでもやめますか？
                        </span>
                      ) : (
                        <>{w.displayName}さんへの見守りのお願いをやめますか？</>
                      )
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
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
