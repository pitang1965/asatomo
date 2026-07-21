import { createFileRoute, Link } from '@tanstack/react-router';
import { type CSSProperties, useState } from 'react';
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
 *   割る場合だけ「最後のメッセージを届けられなくなる」と結果を強めて警告する。
 * 外したあと（決定A）: 行は消える（一覧＝今見守ってくれている人）。再依頼は通常の招待に戻る。
 * 相手への通知（決定A）: しない（本人が当事者。CONTEXT.md 見守り解除の非対称を参照）。
 */
export const Route = createFileRoute('/connections')({
  loader: () => fetchConnectionsPage(),
  component: ConnectionsPage,
});

const page: CSSProperties = {
  background: 'var(--bg)',
  minHeight: '100vh',
  fontFamily: 'var(--font-jp)',
};

const card: CSSProperties = {
  background: 'var(--surface)',
  borderRadius: 16,
  padding: 20,
  maxWidth: 480,
  margin: '16px auto',
  boxShadow: 'var(--shadow-sm)',
};

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

  return <Roster userName={data.userName} initial={data.watchers} />;
}

function Roster({
  userName,
  initial,
}: {
  userName: string;
  initial: SubjectWatcher[];
}) {
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
    <div style={page}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 16px',
          fontSize: 13,
        }}
      >
        <Link to="/" style={{ color: 'var(--accent)' }}>
          ← もどる
        </Link>
        <span style={{ color: 'var(--ink-2)' }}>{userName} さん</span>
      </div>

      <div style={card}>
        <h1 style={{ fontSize: 17, color: 'var(--ink)', margin: 0 }}>
          あなたを見守ってくれている人
        </h1>
        <p
          style={{
            fontSize: 12,
            color: 'var(--ink-2)',
            lineHeight: 1.8,
            margin: '8px 0 0',
          }}
        >
          いま、あなたの「元気」を受け取ってくれている人です。お願いをやめると、
          その人にはあなたの様子が届かなくなります。
        </p>

        {notice ? (
          <p
            style={{
              margin: '14px 0 0',
              fontSize: 13,
              color: 'var(--ink)',
              background: 'var(--good-soft)',
              borderRadius: 10,
              padding: '10px 12px',
            }}
          >
            {notice}
          </p>
        ) : null}

        {watchers.length === 0 ? (
          <p
            style={{
              margin: '16px 0 0',
              fontSize: 13,
              color: 'var(--ink-2)',
              lineHeight: 1.8,
            }}
          >
            まだ、あなたを見守ってくれている人はいません。
            <br />
            トップの「見守り合いに誘う」から声をかけてみましょう。
          </p>
        ) : (
          <ul
            style={{
              listStyle: 'none',
              margin: '14px 0 0',
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {watchers.map((w) => {
              // その1人が「生存」で、生存がちょうど2人なら、外すと開示ラインを割る。
              const willLock = w.isLiving && livingCount === 2;
              return (
                <li
                  key={w.connectionId}
                  style={{
                    border: '1px solid var(--line)',
                    borderRadius: 12,
                    padding: '8px 8px 8px 12px',
                    background: 'var(--surface-2)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--ink)',
                    }}
                  >
                    {w.displayName}
                  </span>
                  {/* 稀な操作なので⋮に畳む（grill フィードバック）。開示ラインを割る時だけ警告（決定B）。 */}
                  <RowMenu
                    actionLabel="見守りをお願いするのをやめる"
                    confirmLabel="やめる"
                    pending={busyId === w.connectionId}
                    onConfirm={() => stopWatching(w)}
                    confirmBody={
                      willLock ? (
                        <span
                          style={{
                            display: 'block',
                            color: 'var(--ink)',
                            background: 'var(--warn-soft)',
                            borderRadius: 10,
                            padding: '10px 12px',
                          }}
                        >
                          {w.displayName}さんを外すと、見守ってくれる人が1人に
                          なります。そのままだと、あなたにもしものことがあっても
                          <strong>最後のメッセージを届けられません</strong>。
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
      </div>
    </div>
  );
}

function Center({ title, body }: { title: string; body: string }) {
  return (
    <div
      style={{
        ...page,
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
    >
      <div style={{ ...card, textAlign: 'center' }}>
        <h1 style={{ fontSize: 18, color: 'var(--ink)', marginBottom: 12 }}>
          {title}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.8 }}>
          {body}
        </p>
        <p style={{ marginTop: 20, fontSize: 13 }}>
          <Link to="/" style={{ color: 'var(--accent)' }}>
            ← トップへ
          </Link>
        </p>
      </div>
    </div>
  );
}
