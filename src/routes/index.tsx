import {
  createFileRoute,
  Link,
  useNavigate,
  useRouter,
} from '@tanstack/react-router';
import { type CSSProperties, useState } from 'react';
import type { DashboardRow } from '../domain/queries';
import { fetchDashboard } from '../server/functions';
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
  }));
}

function Home() {
  const data = Route.useLoaderData();

  if (data.status === 'unconfigured')
    return <SetupNotice message={data.message} />;
  if (data.status === 'signed_out') return <Login />;
  return <Dashboard userName={data.userName} rows={reviveRows(data.rows)} />;
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
          <button
            type="button"
            style={btn}
            onClick={() =>
              authClient.signIn.social({
                provider: 'facebook',
                callbackURL: '/',
              })
            }
          >
            Facebook でログイン
          </button>
          <button
            type="button"
            style={btn}
            onClick={() =>
              authClient.signIn.oauth2({ providerId: 'line', callbackURL: '/' })
            }
          >
            LINE でログイン
          </button>
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
  rows,
}: {
  userName: string;
  rows: DashboardRow[];
}) {
  const router = useRouter();
  const navigate = useNavigate();
  const [notice, setNotice] = useState('');
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
          gap: 12,
          padding: '10px 16px',
          fontSize: 12,
          color: 'var(--ink-2)',
        }}
      >
        <Link to="/messages" style={{ color: 'var(--accent)' }}>
          最後のメッセージ
        </Link>
        <span>{userName} さん</span>
        <button
          type="button"
          style={{
            appearance: 'none',
            border: 0,
            cursor: 'pointer',
            font: 'inherit',
            fontSize: 12,
            color: 'var(--accent)',
            background: 'none',
            padding: 0,
          }}
          onClick={async () => {
            await authClient.signOut();
            router.invalidate();
          }}
        >
          ログアウト
        </button>
      </div>

      {notice ? (
        <p style={{ textAlign: 'center', color: 'var(--good)', fontSize: 13 }}>
          {notice}
        </p>
      ) : null}

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '4px 16px 0' }}>
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
          pendingSubjectId,
        }}
      />
    </div>
  );
}
