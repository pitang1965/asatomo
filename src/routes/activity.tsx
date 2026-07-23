import { createFileRoute, Link } from '@tanstack/react-router';
import type { CSSProperties } from 'react';
import type { SignalKind } from '../domain/monitoring';
import {
  absoluteJa,
  recentActivityText,
  signalTrueLabel,
} from '../domain/recent-activity';
import { fetchActivityHistory } from '../server/functions';

/**
 * 自分のアクティビティ履歴（本人側・透明性の画面。機能: 自分の記録が相手にどう見えるか）。
 *
 * 設計（grill 決定 2026-07-23）:
 *   - 履歴は本人だけに見せる。自分のデータなのでぼかさず「真の種別＋絶対時刻」で全件見せる
 *     （透明性: 何が記録されているかを隠さない。CONTEXT.md 生存シグナル/近況）。
 *   - 見守り者に見えるのは常に「その時点の最新1件」のみ・ぼかし・相対時刻。よって
 *     「見守り者にはこう見えます」の対比は最新1件にだけ添える（過去エントリには添えない。
 *     相手の閲覧時刻次第で相対表示は変わり、そもそも過去分は相手からは見えないため）。
 *   - Web に置く（本人の稀な確認系。ADR-0006 の面の切り分け）。iPhone 本人もここへ来られる。
 */
export const Route = createFileRoute('/activity')({
  loader: () => fetchActivityHistory(),
  component: ActivityPage,
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

function ActivityPage() {
  const data = Route.useLoaderData();

  if (data.status === 'unconfigured')
    return <Center title="サーバーが未設定です" body={data.message} />;
  if (data.status === 'signed_out')
    return (
      <Center
        title="ログインが必要です"
        body="自分の記録の確認は、ご本人のアカウントで行います。"
      />
    );

  return (
    <History
      userName={data.userName}
      isSubject={data.isSubject}
      entries={data.entries.map((e) => ({
        id: e.id,
        kind: e.kind,
        occurredAt: new Date(e.occurredAt),
      }))}
    />
  );
}

function History({
  userName,
  isSubject,
  entries,
}: {
  userName: string;
  isSubject: boolean;
  entries: { id: string; kind: SignalKind; occurredAt: Date }[];
}) {
  const now = new Date();
  const latest = entries[0] ?? null;

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
          あなたの記録
        </h1>
        <p
          style={{
            fontSize: 12,
            color: 'var(--ink-2)',
            lineHeight: 1.8,
            margin: '8px 0 0',
          }}
        >
          {isSubject
            ? 'アサトモが記録している、あなたの「元気」の一覧です。見守ってくれている人に見えるのは、いちばん上の最新の1件だけです。'
            : 'アサトモが記録している、あなたの「元気」の一覧です。いまは見守ってくれる人がいないので、この記録はまだ誰にも届いていません。'}
        </p>

        {/* 見守り者にどう見えるかの対比は、最新1件にだけ添える（相手に見えるのは最新1件のみ）。 */}
        {isSubject && latest ? (
          <div
            style={{
              margin: '14px 0 0',
              background: 'var(--good-soft)',
              borderRadius: 10,
              padding: '10px 12px',
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 12,
                color: 'var(--ink-2)',
                lineHeight: 1.7,
              }}
            >
              いま見守り者に見えているのは、この最新の1件だけです：
            </p>
            <p
              style={{
                margin: '4px 0 0',
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--ink)',
              }}
            >
              「{recentActivityText(latest.kind, latest.occurredAt, now)}」
            </p>
            <p
              style={{
                margin: '6px 0 0',
                fontSize: 11,
                color: 'var(--ink-2)',
                lineHeight: 1.7,
              }}
            >
              時刻はぼかされ、相対的に表示されます（「いってきます」は「元気にしていました」とだけ伝わります）。
            </p>
          </div>
        ) : null}

        {entries.length === 0 ? (
          <p
            style={{
              margin: '16px 0 0',
              fontSize: 13,
              color: 'var(--ink-2)',
              lineHeight: 1.8,
            }}
          >
            まだ記録がありません。
            <br />
            アプリや見守りWebを使うと、ここに「元気」が残っていきます。
          </p>
        ) : (
          <ul
            style={{
              listStyle: 'none',
              margin: '14px 0 0',
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {entries.map((e, i) => (
              <li
                key={e.id}
                style={{
                  border: '1px solid var(--line)',
                  borderRadius: 12,
                  padding: '10px 12px',
                  background: 'var(--surface-2)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <span
                  style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}
                >
                  {signalTrueLabel(e.kind)}
                  {i === 0 && isSubject ? (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 10,
                        fontWeight: 600,
                        color: 'var(--good)',
                      }}
                    >
                      見守り者に表示中
                    </span>
                  ) : null}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color: 'var(--ink-2)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {absoluteJa(e.occurredAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Center({ title, body }: { title: string; body: string }) {
  return (
    <div
      style={{ ...page, display: 'grid', placeItems: 'center', padding: 24 }}
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
