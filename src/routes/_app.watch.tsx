import {
  createFileRoute,
  Link,
  useNavigate,
  useRouter,
} from '@tanstack/react-router';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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

// 空・エラーカードのレイアウト（見た目は Card 部品）。旧 emptyCard は角丸14。
// maxWidth480 + padding20×2 = 520px ＝ max-w-130。
const cardCls = 'mx-auto my-4 max-w-130 rounded-[14px] text-center';

function WatchPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const [notice, setNotice] = useState('');
  const [pendingSubjectId, setPendingSubjectId] = useState<string | null>(null);

  // 取得失敗（DB/接続の一時障害）は接続確認を促し、再読み込みの導線を出す（モバイルと同じ扱い）。
  if (data.status === 'error')
    return (
      <Card className={cardCls}>
        <p className="m-0 text-sm text-foreground">
          様子を取得できませんでした。接続を確認してください。
        </p>
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.invalidate()}
          className="mt-3.5 h-auto rounded-full border border-border px-4 py-2 text-[13px] font-semibold"
        >
          再読み込み
        </Button>
      </Card>
    );

  if (data.status !== 'ok')
    return (
      <p className="p-10 text-center text-muted-foreground">
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
      <Card className={cardCls}>
        <p className="m-0 text-sm font-semibold text-foreground">
          あなたが見守っている人は、まだいません。
        </p>
        <p className="mt-2.5 text-[13px] leading-[1.8] text-muted-foreground">
          <Link to="/me" className="text-primary hover:underline">
            見守り合いに誘った
          </Link>
          相手が「見守り合い」を選ぶと、ここに現れます。
        </p>
      </Card>
    );

  return (
    <div>
      {/* 画面内の総称は「見守っている人」を保つ（下タブ「仲間」を総称に流用しない・決定4）。
          逆向きの /connections「あなたを見守ってくれている人」と主語で明確に区別する。 */}
      <div className="mx-auto max-w-149 px-4.5 pt-5.5">
        <h1 className="m-0 text-[17px] font-bold text-foreground">
          あなたが見守っている人
        </h1>
        <p className="mt-2 text-[12.5px] leading-[1.8] text-muted-foreground">
          あなたが「元気かな」と気にかけている人です。近況をそっと確認できます。
        </p>
      </div>
      {notice ? (
        <p className="mt-2.5 text-center text-[13px] text-(--good)">{notice}</p>
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
