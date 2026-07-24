import {
  createFileRoute,
  Link,
  useNavigate,
  useRouter,
} from '@tanstack/react-router';
import { type CSSProperties, useState } from 'react';
import type { DashboardRow } from '../domain/queries';
import { fetchWatch } from '../server/functions';
import { WatchDashboard } from '../web/WatchDashboard';

/**
 * 「仲間」タブ（/watch）＝あなたが見守っている人の一覧（ADR-0008）。
 * 旧トップに埋まっていた見守りダッシュボードをそのまま移設（見え方・操作は不変・決定8）。
 *
 * 画面内の総称・見出しは「見守っている人」を保つ（下タブラベル「仲間」を総称に流用しない・決定4）。
 * 空状態は招待CTA を置かず、期待の説明＋「わたし」への文字リンク1本のみ（決定5）。
 */
export const Route = createFileRoute('/_app/watch')({
  loader: () => fetchWatch(),
  component: WatchPage,
});

/** サーバー関数の直列化で Date が文字列になっても画面側で復元する。 */
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

const emptyCard: CSSProperties = {
  background: 'var(--surface)',
  borderRadius: 14,
  padding: 20,
  maxWidth: 480,
  margin: '16px auto',
  boxShadow: 'var(--shadow-sm)',
  textAlign: 'center',
};

function WatchPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const [notice, setNotice] = useState('');
  const [pendingSubjectId, setPendingSubjectId] = useState<string | null>(null);

  if (data.status !== 'ok')
    return (
      <p style={{ textAlign: 'center', padding: 40, color: 'var(--ink-2)' }}>
        読み込めませんでした。
      </p>
    );

  const rows = reviveRows(data.rows);

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

  if (rows.length === 0)
    return (
      <div style={emptyCard}>
        <p
          style={{
            margin: 0,
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--ink)',
          }}
        >
          あなたが見守っている人は、まだいません。
        </p>
        <p
          style={{
            margin: '10px 0 0',
            fontSize: 13,
            color: 'var(--ink-2)',
            lineHeight: 1.8,
          }}
        >
          <Link to="/me" style={{ color: 'var(--accent)' }}>
            見守り合いに誘った
          </Link>
          相手が「見守り合い」を選ぶと、ここに現れます。
        </p>
      </div>
    );

  return (
    <div>
      {notice ? (
        <p
          style={{
            textAlign: 'center',
            color: 'var(--good)',
            fontSize: 13,
            margin: '10px 0 0',
          }}
        >
          {notice}
        </p>
      ) : null}
      <WatchDashboard
        rows={rows}
        now={new Date()}
        showHeader={false}
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
