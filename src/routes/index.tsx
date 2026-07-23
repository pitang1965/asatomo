import {
  createFileRoute,
  Link,
  useNavigate,
  useRouter,
} from '@tanstack/react-router';
import { type CSSProperties, useEffect, useState } from 'react';
import type { DashboardRow } from '../domain/queries';
import { fetchDashboard } from '../server/functions';
import { Avatar } from '../web/Avatar';
import { authClient } from '../web/auth-client';
import { WatchDashboard } from '../web/WatchDashboard';

/**
 * 見守りWeb のトップ。ローダーがサーバー関数で状態を判定し、
 * 未設定 → セットアップ案内 / 未ログイン → ログイン / ログイン済み → 実データのダッシュボード。
 * 「無事です」（代理確認）は POST /api/watch/attest に接続済み。
 * 「連絡がつきません」（死亡確認フロー）の実接続は次段（現状はプレビューで確認）。
 */
export const Route = createFileRoute('/')({
  loader: () => fetchDashboard(),
  component: Home,
});

/** サーバー関数の直列化で Date が文字列になっても画面側で復元できるようにする。 */
function reviveRows(rows: DashboardRow[]): DashboardRow[] {
  const d = (v: Date | string | null): Date | null =>
    v == null ? null : new Date(v);
  return rows.map((r) => ({
    ...r,
    travelUntil: d(r.travelUntil),
    lastSignalAt: d(r.lastSignalAt),
    latestAt: d(r.latestAt),
    appLoggedOutAt: d(r.appLoggedOutAt),
  }));
}

function Home() {
  const data = Route.useLoaderData();

  if (data.status === 'unconfigured')
    return <SetupNotice message={data.message} />;
  if (data.status === 'signed_out') return <Login />;
  return (
    <Dashboard
      userName={data.userName}
      userImage={data.userImage}
      rows={reviveRows(data.rows)}
      isSubject={data.isSubject}
    />
  );
}

const page: CSSProperties = {
  background: 'var(--bg)',
  minHeight: '100vh',
  fontFamily: 'var(--font-jp)',
  display: 'grid',
  placeItems: 'center',
  padding: 24,
};

const card: CSSProperties = {
  background: 'var(--surface)',
  borderRadius: 20,
  padding: '32px 28px',
  maxWidth: 380,
  width: '100%',
  boxShadow: '0 8px 32px rgb(0 0 0 / 0.08)',
  textAlign: 'center',
};

function SetupNotice({ message }: { message: string }) {
  return (
    <div style={page}>
      <div style={card}>
        <h1 style={{ fontSize: 18, color: 'var(--ink)', marginBottom: 12 }}>
          サーバーが未設定です
        </h1>
        <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.8 }}>
          {message}
        </p>
        <p style={{ marginTop: 20, fontSize: 13 }}>
          <Link to="/preview" style={{ color: 'var(--accent)' }}>
            設定なしで画面プレビューを見る →
          </Link>
        </p>
      </div>
    </div>
  );
}

function Login() {
  const btn: CSSProperties = {
    appearance: 'none',
    border: '1px solid var(--line)',
    cursor: 'pointer',
    font: 'inherit',
    display: 'block',
    width: '100%',
    padding: '12px 16px',
    borderRadius: 12,
    fontWeight: 600,
    fontSize: 14,
    background: 'var(--surface-2)',
    color: 'var(--ink)',
    marginTop: 10,
  };
  return (
    <div style={page}>
      <div style={card}>
        <img
          src="/apple-touch-icon.png"
          alt=""
          aria-hidden
          width={56}
          height={56}
          style={{ display: 'block', margin: '0 auto 8px', borderRadius: 12 }}
        />
        <h1 style={{ fontSize: 20, color: 'var(--ink)' }}>
          アサトモ 見守りWeb
        </h1>
        <p
          style={{
            fontSize: 13,
            color: 'var(--ink-2)',
            lineHeight: 1.8,
            marginTop: 8,
          }}
        >
          大切な人の「今日も元気」を、そっと見守るページです。
          <br />
          お使いのアカウントでログインしてください。
        </p>
        <div style={{ marginTop: 20 }}>
          <button
            type="button"
            style={btn}
            onClick={() =>
              authClient.signIn.social({ provider: 'google', callbackURL: '/' })
            }
          >
            Google でログイン
          </button>
          {/* Facebook / LINE は未実装（backlog 項目17）のため一時的に非表示。
              押しても失敗する導線を出さない（クローズドテストの第一印象を損ねないため）。
              実装時に、下記のボタンを復活させる:
                authClient.signIn.social({ provider: 'facebook', callbackURL: '/' })
                authClient.signIn.oauth2({ providerId: 'line', callbackURL: '/' }) */}
        </div>
        <p style={{ marginTop: 20, fontSize: 12 }}>
          <Link to="/preview" style={{ color: 'var(--accent)' }}>
            ログインせずに画面プレビューを見る →
          </Link>
        </p>
      </div>
    </div>
  );
}

function Dashboard({
  userName,
  userImage,
  rows,
  isSubject,
}: {
  userName: string;
  userImage: string | null;
  rows: DashboardRow[];
  /** 閲覧者が見守られている本人なら、手動シグナルと自動チェックインを有効化。 */
  isSubject: boolean;
}) {
  const router = useRouter();
  const navigate = useNavigate();
  const [notice, setNotice] = useState('');
  const [signalNotice, setSignalNotice] = useState('');

  // 見守られている本人がこのページを開いたこと自体が生存シグナル（自動 web_checkin）。
  // アプリの app_open と同じ15分スロットル。透明性の原則で下のセクションに明記する。
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
  const [pendingSubjectId, setPendingSubjectId] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);

  async function createInvite() {
    setInviteBusy(true);
    setNotice('');
    try {
      const res = await fetch('/api/invitations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) throw new Error(`invite failed: ${res.status}`);
      const { token } = (await res.json()) as { token: string };
      setInviteLink(`${window.location.origin}/join/${token}`);
      setInviteCopied(false);
    } catch {
      setNotice('招待リンクの作成に失敗しました。時間をおいてお試しください。');
    } finally {
      setInviteBusy(false);
    }
  }

  async function copyInvite() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setInviteCopied(true);
    } catch {
      setInviteCopied(false);
    }
  }

  async function confirmAlive(subjectUserId: string) {
    setPendingSubjectId(subjectUserId);
    setNotice('');
    try {
      const res = await fetch('/api/watch/attest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subjectUserId }),
      });
      if (!res.ok) throw new Error(`attest failed: ${res.status}`);
      setNotice('「無事です」を送信しました（代理確認）');
      await router.invalidate();
    } catch {
      setNotice('送信に失敗しました。時間をおいてもう一度お試しください。');
    } finally {
      setPendingSubjectId(null);
    }
  }

  // 見守り者端の解除。降りたら一覧から消える（再取得）。本人へは名指しで通知される（サーバー側）。
  async function leaveWatch(subjectUserId: string, name: string) {
    setPendingSubjectId(subjectUserId);
    setNotice('');
    try {
      const res = await fetch('/api/watch/leave', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subjectUserId }),
      });
      if (!res.ok) throw new Error(`leave failed: ${res.status}`);
      setNotice(`${name}さんの見守りをやめました。`);
      await router.invalidate();
    } catch {
      setNotice('うまくいきませんでした。時間をおいてお試しください。');
    } finally {
      setPendingSubjectId(null);
    }
  }

  return (
    <div
      style={{
        background: 'var(--bg)',
        minHeight: '100vh',
        fontFamily: 'var(--font-jp)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 14,
          padding: '10px 16px',
          fontSize: 12,
          color: 'var(--ink-2)',
        }}
      >
        <Link to="/messages" style={{ color: 'var(--accent)' }}>
          最後のメッセージ
        </Link>
        {/* 名前テキスト＋ログアウトを畳んだアバター。押すとアカウント画面（ログアウト・削除）へ。 */}
        <Link
          to="/account"
          aria-label={`${userName} さんのアカウント`}
          title={`${userName} さん`}
          style={{ display: 'inline-flex' }}
        >
          <Avatar name={userName} image={userImage} size={32} />
        </Link>
      </div>

      {notice ? (
        <p style={{ textAlign: 'center', color: 'var(--good)', fontSize: 13 }}>
          {notice}
        </p>
      ) : null}

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '4px 16px 0' }}>
        {isSubject ? (
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: 14,
              padding: 14,
              marginBottom: 10,
              boxShadow: '0 4px 16px rgb(0 0 0 / 0.06)',
            }}
          >
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
            {/* 透明性: 何が記録され、相手にどう見えるかを本人がいつでも確認できる（grill 2026-07-23）。 */}
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
        ) : null}
        {inviteLink ? (
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: 14,
              padding: 14,
              boxShadow: '0 4px 16px rgb(0 0 0 / 0.06)',
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
              このリンクを、見守り合いたい相手に送ってください（7日で失効）。
            </p>
            <input
              readOnly
              value={inviteLink}
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
              {inviteCopied ? 'コピーしました ✓' : 'リンクをコピー'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={createInvite}
            disabled={inviteBusy}
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
        )}
        {/* 逆向き（あなたを見守ってくれている人）の確認・整理は別ページへ。
            一字違いの逆向きリストをこの画面に同居させない（CONTEXT.md 本人）。 */}
        {isSubject ? (
          <p style={{ margin: '10px 0 0', textAlign: 'center', fontSize: 12 }}>
            <Link to="/connections" style={{ color: 'var(--ink-2)' }}>
              見守ってくれている人を確認・整理する →
            </Link>
          </p>
        ) : null}
      </div>

      <WatchDashboard
        rows={rows}
        now={new Date()}
        actions={{
          onConfirmAlive: confirmAlive,
          onCannotReach: (subjectUserId) =>
            navigate({
              to: '/death/$subjectId',
              params: { subjectId: subjectUserId },
            }),
          onLeaveWatch: leaveWatch,
          pendingSubjectId,
        }}
      />
    </div>
  );
}
