import { createFileRoute, Link } from '@tanstack/react-router';
import { type CSSProperties, useEffect, useState } from 'react';
import { fetchMe } from '../server/functions';

/**
 * 「わたし」タブ（/me）＝見られる側の全部。既定タブ（ADR-0008 §実装決定3・6）。
 *
 * 並び（決定6）: 様子を伝える → あなたの記録 → 見守ってくれる人（人数＋2人未満警告）→ 誘う。
 * 見守ってくれる人が0人の本人（誰かを見守るためだけに来た人）には様子ブロックと人数を出さず、
 * 勧誘の空状態カードに差し替える。招待CTA はここに一本化する（「仲間」空状態には置かない・決定5）。
 */
export const Route = createFileRoute('/_app/me')({
  loader: () => fetchMe(),
  component: MePage,
});

const wrap: CSSProperties = {
  maxWidth: 480,
  margin: '0 auto',
  padding: '12px 16px 0',
};

const cardBox: CSSProperties = {
  background: 'var(--surface)',
  borderRadius: 14,
  padding: 14,
  marginBottom: 10,
  boxShadow: '0 4px 16px rgb(0 0 0 / 0.06)',
};

function MePage() {
  const data = Route.useLoaderData();
  if (data.status !== 'ok')
    return (
      <p style={{ textAlign: 'center', padding: 40, color: 'var(--ink-2)' }}>
        読み込めませんでした。
      </p>
    );
  return (
    <Me
      watchersTotal={data.watchersTotal}
      watchersLiving={data.watchersLiving}
    />
  );
}

function Me({
  watchersTotal,
  watchersLiving,
}: {
  watchersTotal: number;
  watchersLiving: number;
}) {
  const isSubject = watchersTotal > 0;
  const [signalNotice, setSignalNotice] = useState('');
  const [notice, setNotice] = useState('');

  // このページを開いたこと自体が生存シグナル（自動 web_checkin）。アプリの app_open と同じ
  // 15分スロットル。見守ってくれる人が居る本人のときだけ（届く先がある）。透明性は下に明記。
  useEffect(() => {
    if (!isSubject) return;
    const key = 'asatomo.webCheckinSentAt';
    const last = Number(localStorage.getItem(key) ?? 0);
    if (Date.now() - last < 15 * 60_000) return;
    localStorage.setItem(key, String(Date.now()));
    fetch('/api/signals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'web_checkin', source: 'web' }),
    }).catch(() => {});
  }, [isSubject]);

  async function sendSignal(kind: string, label: string) {
    setSignalNotice('');
    try {
      const res = await fetch('/api/signals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, source: 'web' }),
      });
      if (!res.ok) throw new Error(`signal failed: ${res.status}`);
      setSignalNotice(`✓ 「${label}」が届きました`);
    } catch {
      setSignalNotice('送信できませんでした。時間をおいてお試しください。');
    }
  }

  return (
    <div style={wrap}>
      {notice ? (
        <p
          style={{
            textAlign: 'center',
            color: 'var(--good)',
            fontSize: 13,
            margin: '0 0 8px',
          }}
        >
          {notice}
        </p>
      ) : null}

      {isSubject ? (
        <>
          {/* 1. 様子を伝える（最頻・最上部） */}
          <div style={cardBox}>
            <p
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--ink)',
              }}
            >
              いまの様子を伝える
            </p>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                marginTop: 10,
              }}
            >
              {(
                [
                  ['meal', 'ごはん'],
                  ['sleep', 'おやすみ'],
                  ['outing', 'いってきます'],
                  ['homecoming', 'ただいま'],
                ] as const
              ).map(([kind, label]) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => sendSignal(kind, label)}
                  style={{
                    appearance: 'none',
                    border: '1px solid var(--line)',
                    cursor: 'pointer',
                    padding: '8px 14px',
                    borderRadius: 999,
                    fontWeight: 600,
                    fontSize: 13,
                    background: 'var(--surface-2)',
                    color: 'var(--ink)',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* 透明性の原則: 自動記録を隠さない（CONTEXT.md 生存シグナル）。 */}
            <p
              style={{
                margin: '10px 0 0',
                fontSize: 11,
                color: 'var(--ink-2)',
                lineHeight: 1.6,
              }}
            >
              このページを開いたことも「元気」として自動で伝わります。
            </p>
            <p style={{ margin: '8px 0 0', fontSize: 12 }}>
              <Link to="/activity" style={{ color: 'var(--accent)' }}>
                あなたの記録を見る（相手にどう見えるか）→
              </Link>
            </p>
            {signalNotice ? (
              <p
                style={{
                  margin: '8px 0 0',
                  fontSize: 12,
                  color: 'var(--good)',
                }}
              >
                {signalNotice}
              </p>
            ) : null}
          </div>

          {/* 3. 見守ってくれる人（人数は常時／2人未満だけ警告。決定6） */}
          <div style={cardBox}>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--ink)' }}>
              見守ってくれる人：<strong>{watchersTotal}人</strong>
            </p>
            {watchersLiving < 2 ? (
              <p
                style={{
                  margin: '8px 0 0',
                  fontSize: 12.5,
                  lineHeight: 1.8,
                  color: 'var(--ink)',
                  background: 'var(--warn-soft)',
                  borderRadius: 10,
                  padding: '10px 12px',
                }}
              >
                このままだと、もしものときに
                <strong>最後の伝言を届けられません</strong>
                。見守ってくれる人が2人になると届けられるようになります。
              </p>
            ) : null}
            <p style={{ margin: '10px 0 0', fontSize: 12 }}>
              <Link to="/connections" style={{ color: 'var(--ink-2)' }}>
                見守ってくれている人を確認・整理する →
              </Link>
            </p>
          </div>

          {/* 4. 見守り合いに誘う（成立済みには用済みなので最下部） */}
          <Invite onNotice={setNotice} />
        </>
      ) : (
        /* 見守ってくれる人が0人＝勧誘の空状態カードに差し替え（決定6） */
        <>
          <div style={cardBox}>
            <p
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--ink)',
              }}
            >
              あなたを見守ってくれる人は、まだいません。
            </p>
            <p
              style={{
                margin: '8px 0 14px',
                fontSize: 13,
                color: 'var(--ink-2)',
                lineHeight: 1.8,
              }}
            >
              見守り合いに誘うと、あなたの「今日も元気」も相手に届くようになります。
            </p>
            <Invite onNotice={setNotice} />
          </div>
          <p style={{ textAlign: 'center', fontSize: 12 }}>
            <Link to="/activity" style={{ color: 'var(--ink-2)' }}>
              あなたの記録を見る（何が記録されるか）→
            </Link>
          </p>
        </>
      )}
    </div>
  );
}

/** 招待リンクの発行＋コピー。CTA はわたしに一本化（ADR-0008 §実装決定5）。 */
function Invite({ onNotice }: { onNotice: (m: string) => void }) {
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function createInvite() {
    setBusy(true);
    onNotice('');
    try {
      const res = await fetch('/api/invitations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) throw new Error(`invite failed: ${res.status}`);
      const { token } = (await res.json()) as { token: string };
      setLink(`${window.location.origin}/join/${token}`);
      setCopied(false);
    } catch {
      onNotice('招待リンクの作成に失敗しました。時間をおいてお試しください。');
    } finally {
      setBusy(false);
    }
  }

  async function copyInvite() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (link)
    return (
      <div style={cardBox}>
        <p
          style={{
            fontSize: 12,
            color: 'var(--ink-2)',
            lineHeight: 1.7,
            margin: 0,
          }}
        >
          このリンクを、見守り合いたい相手に送ってください（7日で失効）。
        </p>
        <input
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          style={{
            width: '100%',
            marginTop: 8,
            padding: '8px 10px',
            borderRadius: 8,
            border: '1px solid var(--line)',
            background: 'var(--surface-2)',
            color: 'var(--ink)',
            fontSize: 12,
            boxSizing: 'border-box',
          }}
        />
        <button
          type="button"
          onClick={copyInvite}
          style={{
            appearance: 'none',
            border: 0,
            cursor: 'pointer',
            marginTop: 8,
            padding: '8px 14px',
            borderRadius: 10,
            fontWeight: 600,
            fontSize: 13,
            background: 'var(--accent)',
            color: '#fff',
          }}
        >
          {copied ? 'コピーしました ✓' : 'リンクをコピー'}
        </button>
      </div>
    );

  return (
    <button
      type="button"
      onClick={createInvite}
      disabled={busy}
      style={{
        appearance: 'none',
        border: '1px solid var(--line)',
        cursor: 'pointer',
        width: '100%',
        padding: '10px 16px',
        borderRadius: 12,
        fontWeight: 600,
        fontSize: 14,
        background: 'var(--surface-2)',
        color: 'var(--ink)',
      }}
    >
      🤝 見守り合いに誘う
    </button>
  );
}
