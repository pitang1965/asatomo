import { createFileRoute, Link } from '@tanstack/react-router';
import { QRCodeSVG } from 'qrcode.react';
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

// コンテンツ幅は全タブ共通の 560（/watch・/messages と一致）。下タブ切り替えで幅が
// ジャンプしないよう、わたし系（/me・/activity・/connections）もこの値に揃える。
const wrap: CSSProperties = {
  maxWidth: 560,
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
      travelUntil={data.travelUntil}
    />
  );
}

function Me({
  watchersTotal,
  watchersLiving,
  travelUntil,
}: {
  watchersTotal: number;
  watchersLiving: number;
  travelUntil: string | null;
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
              <span aria-hidden="true" style={{ marginRight: 6 }}>
                📣
              </span>
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
                  // アイコンはモバイル（MainActivity）と揃える。
                  ['wake', 'おはよう', '☀️'],
                  ['meal', 'ごはん', '🍚'],
                  ['sleep', 'おやすみ', '🌙'],
                  ['outing', 'いってきます', '👋'],
                  ['homecoming', 'ただいま', '🏠'],
                ] as const
              ).map(([kind, label, icon]) => (
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
                  <span aria-hidden="true" style={{ marginRight: 6 }}>
                    {icon}
                  </span>
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

          {/* 3. あなたを見守ってくれる人（人数は常時／2人未満だけ警告。決定6）
                 主語を明示し「あなたが見守っている人」(=仲間タブ/逆向き)との一字違いの取り違えを防ぐ。 */}
          <div style={cardBox}>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--ink)' }}>
              <span aria-hidden="true" style={{ marginRight: 6 }}>
                👥
              </span>
              あなたを見守ってくれる人：<strong>{watchersTotal}人</strong>
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

          {/* 4. 旅行モード（見守りの一時休止。モバイルと機能を揃える） */}
          <TravelMode initialUntil={travelUntil} />

          {/* 5. 見守り合いに誘う（成立済みには用済みなので最下部） */}
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

/**
 * 旅行モード（見守りの一時休止）。モバイル（MainActivity）と機能を揃える。
 * 期限まで見守りを止め、期限が来たらサーバー側で自動再開する（最長30日はサーバーが強制）。
 * 見守ってくれる人には「旅行中」として伝わる（監視は止まっても存在は隠さない）。
 */
function TravelMode({ initialUntil }: { initialUntil: string | null }) {
  const [until, setUntil] = useState<string | null>(initialUntil);
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const active = until != null && new Date(until) > new Date();

  // 入力の許容範囲：最短「明日」〜最長「30日後」（サーバーの上限に合わせる）。
  const min = ymd(addDays(new Date(), 1));
  const max = ymd(addDays(new Date(), 30));

  async function enter() {
    if (!date) return;
    setBusy(true);
    setMsg('');
    try {
      // 帰宅日いっぱいまで休止（その日の終わりに再開）。
      const untilIso = new Date(`${date}T23:59:59`).toISOString();
      const res = await fetch('/api/travel', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ until: untilIso }),
      });
      if (!res.ok) throw new Error(`travel failed: ${res.status}`);
      setUntil(untilIso);
      setMsg(`旅行モードにしました（${formatMd(untilIso)} まで）。`);
    } catch {
      setMsg('設定できませんでした。期間が長すぎないか確認してください。');
    } finally {
      setBusy(false);
    }
  }

  async function exit() {
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch('/api/travel', { method: 'DELETE' });
      if (!res.ok) throw new Error(`travel clear failed: ${res.status}`);
      setUntil(null);
      setDate('');
      setMsg('旅行モードを解除しました。見守りを再開します。');
    } catch {
      setMsg('解除できませんでした。時間をおいてお試しください。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={cardBox}>
      <p
        style={{
          margin: 0,
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--ink)',
        }}
      >
        <span aria-hidden="true" style={{ marginRight: 6 }}>
          🧳
        </span>
        旅行モード
      </p>
      {active ? (
        <>
          <p
            style={{
              margin: '10px 0 0',
              fontSize: 12.5,
              color: 'var(--ink-2)',
              lineHeight: 1.8,
            }}
          >
            あなたへの見守りをお休み中です（
            <strong>{formatMd(until as string)}</strong>{' '}
            まで）。期限が来たら自動で再開します。見守ってくれる人にも「旅行中」と伝わっています。
          </p>
          <button
            type="button"
            onClick={exit}
            disabled={busy}
            style={travelBtn}
          >
            旅行モードを解除する
          </button>
        </>
      ) : (
        <>
          <p
            style={{
              margin: '10px 0 0',
              fontSize: 12.5,
              color: 'var(--ink-2)',
              lineHeight: 1.8,
            }}
          >
            旅行などで生活リズムが変わると、いつもの様子が届かず、見守ってくれる人によけいな心配をかけてしまうことがあります。その間だけ、あなたへの見守りを一時お休みにできます。期限が来たら自動で再開します（最長30日）。
          </p>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              alignItems: 'center',
              marginTop: 10,
            }}
          >
            <label style={{ fontSize: 12.5, color: 'var(--ink)' }}>
              帰る日：{' '}
              <input
                type="date"
                value={date}
                min={min}
                max={max}
                onChange={(e) => setDate(e.target.value)}
                style={{
                  fontSize: 13,
                  padding: '6px 8px',
                  borderRadius: 8,
                  border: '1px solid var(--line)',
                  background: 'var(--surface-2)',
                  color: 'var(--ink)',
                }}
              />
            </label>
            <button
              type="button"
              onClick={enter}
              disabled={busy || !date}
              style={{ ...travelBtn, marginTop: 0, opacity: date ? 1 : 0.6 }}
            >
              旅行モードにする
            </button>
          </div>
        </>
      )}
      {msg ? (
        <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--ink-2)' }}>
          {msg}
        </p>
      ) : null}
    </div>
  );
}

const travelBtn: CSSProperties = {
  appearance: 'none',
  marginTop: 10,
  border: '1px solid var(--line)',
  cursor: 'pointer',
  padding: '8px 14px',
  borderRadius: 999,
  fontWeight: 600,
  fontSize: 13,
  background: 'var(--surface-2)',
  color: 'var(--ink)',
};

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** <input type="date"> 用のローカル日付文字列（YYYY-MM-DD）。 */
function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 「M月D日」表示（旅行モードの期限用）。 */
function formatMd(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
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
        {/* 遠くの人へ：リンクをコピーして送る（既存の経路）。 */}
        <p
          style={{
            fontSize: 12,
            color: 'var(--ink-2)',
            lineHeight: 1.7,
            margin: 0,
          }}
        >
          <strong style={{ color: 'var(--ink)' }}>送るなら</strong>
          ：このリンクをコピーして、見守り合いたい相手に送ってください（7日で失効）。
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

        {/* 目の前の人へ：その場でカメラに読ませる。QR は使い切りトークンURLを
            画像化しただけ（別概念ではない）。保存・シェアは付けない＝対面以外の
            経路を増やさない（ADR-0005 再利用リンク却下／なふだ ADR-0013 と整合）。 */}
        <div
          style={{
            marginTop: 14,
            paddingTop: 14,
            borderTop: '1px solid var(--line)',
          }}
        >
          <p
            style={{
              fontSize: 12,
              color: 'var(--ink-2)',
              lineHeight: 1.7,
              margin: 0,
            }}
          >
            <strong style={{ color: 'var(--ink)' }}>目の前の人になら</strong>
            ：このQRコードを相手のカメラで読み取ってもらってください（読み取れないときは上のリンクを送ってください）。
          </p>
          {/* ダークモードでも反転せず白地・黒モジュールで固定。暗背景でも浮くよう
              白の角丸プレートで囲う（quiet zone だけに頼らない）。読み取り成功が命。 */}
          <div
            style={{
              display: 'inline-block',
              marginTop: 10,
              padding: 12,
              background: '#fff',
              borderRadius: 12,
              lineHeight: 0,
            }}
          >
            <QRCodeSVG
              value={link}
              size={220}
              level="M"
              marginSize={4}
              bgColor="#FFFFFF"
              fgColor="#000000"
            />
          </div>
        </div>
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
