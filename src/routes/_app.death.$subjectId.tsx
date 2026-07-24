import {
  createFileRoute,
  Link,
  useNavigate,
  useRouter,
} from '@tanstack/react-router';
import { type CSSProperties, useState } from 'react';
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

const page: CSSProperties = {
  background: 'var(--bg)',
  minHeight: '100vh',
  fontFamily: 'var(--font-jp)',
};

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div
      style={{ ...page, display: 'grid', placeItems: 'center', padding: 24 }}
    >
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: 20,
          padding: '32px 28px',
          maxWidth: 420,
          boxShadow: '0 8px 32px rgb(0 0 0 / 0.08)',
          textAlign: 'center',
        }}
      >
        <h1 style={{ fontSize: 18, color: 'var(--ink)', marginBottom: 12 }}>
          {title}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.8 }}>
          {body}
        </p>
        <p style={{ marginTop: 20, fontSize: 13 }}>
          <Link to="/watch" style={{ color: 'var(--accent)' }}>
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
    <div style={page}>
      <div style={{ padding: '10px 16px', fontSize: 13 }}>
        <Link to="/watch" style={{ color: 'var(--accent)' }}>
          ← 仲間へ戻る
        </Link>
      </div>
      {error ? (
        <p
          style={{
            textAlign: 'center',
            color: 'var(--bad, #b14)',
            fontSize: 13,
          }}
        >
          {error}
        </p>
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
