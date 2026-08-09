import {
  createFileRoute,
  Link,
  useNavigate,
  useRouter,
} from '@tanstack/react-router';
import { useState } from 'react';
import { fetchDeathConfirm } from '../server/functions';
import { DeathConfirm } from '../web/DeathConfirm';

/**
 * 死亡確認画面。「連絡を試みた結果の報告」3択を実APIへ配線する:
 *   亡くなられていません → attest（投票済みなら withdraw → attest。不変条件Bはドメイン側で担保）
 *   未確認です           → 何もせずダッシュボードへ
 *   亡くなられました     → vote（最初の一票で voting へ遷移、定足数成立で猶予入り）
 * 状態ごとの分岐: 平常 → 案内 / 猶予中 → 期限表示 / 見守り者でない → 404 相当。
 */
export const Route = createFileRoute('/_app/death/$subjectId')({
  loader: ({ params }) =>
    fetchDeathConfirm({ data: { subjectUserId: params.subjectId } }),
  component: DeathPage,
});

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-background p-6">
      <div className="max-w-119 rounded-[20px] bg-card px-7 py-8 text-center shadow-[0_8px_32px_rgb(0_0_0/0.08)]">
        <h1 className="mb-3 text-lg text-foreground">{title}</h1>
        <p className="text-[13px] leading-[1.8] text-muted-foreground">
          {body}
        </p>
        <p className="mt-5 text-[13px]">
          <Link to="/watch" className="text-primary hover:underline">
            ← 仲間へ戻る
          </Link>
        </p>
      </div>
    </div>
  );
}

function DeathPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  if (data.status === 'unconfigured')
    return <Notice title="サーバーが未設定です" body={data.message} />;
  if (data.status === 'forbidden')
    return (
      <Notice
        title="このページは表示できません"
        body="この方の見守り者としてログインしている場合のみ確認できます。"
      />
    );

  const { info } = data;

  /** 複数APIを順に叩き、全部成功したら再読込（例: 取り下げ → 代理確認）。 */
  async function report(paths: string[]) {
    setPending(true);
    setError('');
    try {
      for (const path of paths) {
        const res = await fetch(path, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ subjectUserId: info.subjectUserId }),
        });
        if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
      }
      await router.invalidate();
    } catch {
      setError('送信に失敗しました。時間をおいてもう一度お試しください。');
    } finally {
      setPending(false);
    }
  }

  if (info.state === 'normal')
    return (
      <Notice
        title={`${info.subjectName}さんは平常です`}
        body="現在、確認が必要な状況ではありません。生存シグナルが途絶えて見守り者への連絡が始まったときに、この画面から確認できるようになります。"
      />
    );

  if (info.state === 'certified_grace') {
    const until = info.graceUntil
      ? new Date(info.graceUntil).toLocaleString('ja-JP')
      : '（期限計算中）';
    return (
      <Notice
        title="確認が成立し、猶予期間に入っています"
        body={`${until} まではご本人がいつでも取り消せます。期限を過ぎると「最後の伝言」が受取人へ開示されます。`}
      />
    );
  }

  if (info.state === 'disclosed')
    return (
      <Notice
        title="開示済みです"
        body="「最後の伝言」はすでに受取人へ届けられました。"
      />
    );

  // unresponsive / watchers_alerted / voting → 確認（投票）画面
  return (
    <div className="min-h-screen bg-background">
      <div className="px-4 py-2.5 text-[13px]">
        <Link to="/watch" className="text-primary hover:underline">
          ← 仲間へ戻る
        </Link>
      </div>
      {error ? (
        <p className="text-center text-[13px] text-destructive">{error}</p>
      ) : null}
      <DeathConfirm
        subjectName={info.subjectName}
        votesFor={info.votesFor}
        livingWatchers={info.livingWatchers}
        graceHours={info.graceHours}
        pending={pending}
        myVoteActive={info.myVoteActive}
        onAlive={() =>
          report(
            info.myVoteActive
              ? ['/api/watch/vote/withdraw', '/api/watch/attest']
              : ['/api/watch/attest'],
          )
        }
        onUnknown={() => navigate({ to: '/' })}
        onConfirm={() => report(['/api/watch/vote'])}
        onWithdraw={() => report(['/api/watch/vote/withdraw'])}
      />
    </div>
  );
}
