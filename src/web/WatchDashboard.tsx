import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { DashboardRow } from '../domain/queries';
import { recentActivityText } from '../domain/recent-activity';
import { Avatar } from './Avatar';
import { RowMenu } from './RowMenu';

/**
 * 見守りWeb ダッシュボード（プレゼンテーション）。データ取得・アクションは props で受け、
 * TanStack Start のルート/サーバー関数から注入する（このコンポーネントは純粋）。
 * 近況は過去形＋経過時間のみ（監視感を出さない）。アラート中の本人を上に。
 */

// 全幅ボタン（角丸13・padding13/16・14.5px・太字）。
const alertBtnBase =
  'h-auto w-full rounded-[13px] py-3.25 text-[14.5px] font-semibold';
// btn--calm＝落ち着いた緑（--good）+白文字。btn--ghost＝surface-2 + ボーダー。
const calmBtn = `${alertBtnBase} bg-(--good) text-white hover:bg-(--good)/90`;
const ghostBtn = `${alertBtnBase} border border-border`;

export interface WatchAction {
  /** 「連絡がついた・無事です」= 代理確認。 */
  onConfirmAlive: (subjectUserId: string) => void;
  /** 「連絡がつきません」= 死亡確認フローへ（投票開始）。 */
  onCannotReach: (subjectUserId: string) => void;
  /**
   * 「見守りをやめる」= 見守り者端の解除（自分がこの人を見守るのをやめる。grill 決定A）。
   * 未指定なら導線を出さない（プレビュー等）。
   */
  onLeaveWatch?: (subjectUserId: string, subjectName: string) => void;
  /** アクション実行中の本人ID（ボタン無効化用）。 */
  pendingSubjectId?: string | null;
}

/**
 * 「見守りをやめる」導線。稀・管理的なので⋮メニューの中に畳む（grill 決定A＋フィードバック）。
 * 生死系アクション（無事です／連絡がつきません）とは別階層。確認で向きの明示・自分の見守りは
 * 不変・相手への通知予告を出す（決定C/D）。onLeaveWatch 未指定なら出さない（プレビュー等）。
 */
function LeaveMenu({
  row,
  actions,
}: {
  row: DashboardRow;
  actions: WatchAction;
}) {
  const onLeave = actions.onLeaveWatch;
  if (!onLeave) return null;
  return (
    <RowMenu
      actionLabel="見守りをやめる"
      pending={actions.pendingSubjectId === row.subjectUserId}
      onConfirm={() => onLeave(row.subjectUserId, row.name)}
      confirmBody={
        <>
          {row.name}さんの見守りをやめますか？
          <br />
          あなたを見守ってくれる人（あなた自身の見守り）は、これでは変わりません。
          <br />
          {row.name}さんには、あなたが見守りをやめたことをお知らせします。
        </>
      }
    />
  );
}

const AVATAR_COLORS = ['#e0912f', '#3a8aa3', '#5a659a', '#4f9e7f', '#b16478'];
function avatarColor(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function StatusPill({ row, now }: { row: DashboardRow; now: Date }) {
  if (row.isAlert)
    return (
      <Badge variant="warn" dot>
        要確認
      </Badge>
    );
  if (row.travelUntil && row.travelUntil > now)
    return (
      <Badge variant="travel" dot>
        旅行
      </Badge>
    );
  if (row.currentPresence === 'sleeping')
    return (
      <Badge variant="night" dot>
        就寝中
      </Badge>
    );
  return (
    <Badge variant="good" dot>
      元気そう
    </Badge>
  );
}

function SubjectCard({
  row,
  now,
  actions,
}: {
  row: DashboardRow;
  now: Date;
  actions: WatchAction;
}) {
  const statusText =
    row.travelUntil && row.travelUntil > now
      ? `旅行中 · ${row.travelUntil.getMonth() + 1}/${row.travelUntil.getDate()} まで`
      : recentActivityText(row.latestKind, row.latestAt, now);
  return (
    <div className="mb-2.75 flex items-center gap-3.25 rounded-[15px] border border-border bg-card p-3.75 shadow-(--shadow-sm)">
      <Avatar
        name={row.name}
        color={avatarColor(row.subjectUserId)}
        size={34}
      />
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold">{row.name}</div>
        <div className="text-[13px] text-muted-foreground">{statusText}</div>
        {row.appLoggedOutAt ? (
          <div className="mt-0.5 text-xs text-(--warn)">
            スマホアプリからログアウト中です（Webからは今も「元気」が届きます）
          </div>
        ) : null}
      </div>
      <StatusPill row={row} now={now} />
      <LeaveMenu row={row} actions={actions} />
    </div>
  );
}

function AlertCard({
  row,
  now,
  actions,
}: {
  row: DashboardRow;
  now: Date;
  actions: WatchAction;
}) {
  const hours = row.lastSignalAt
    ? Math.floor((now.getTime() - row.lastSignalAt.getTime()) / 3_600_000)
    : null;
  const pending = actions.pendingSubjectId === row.subjectUserId;
  return (
    <div className="mb-3.5 rounded-2xl border border-[color-mix(in_oklab,var(--warn)_40%,var(--line))] bg-card shadow-(--shadow-sm)">
      <div className="h-1 rounded-t-[15px] bg-(--warn)" />
      <div className="p-4.25">
        <div className="flex items-start justify-between gap-2">
          <p className="mb-1.5 text-[15.5px] font-bold">
            {row.name}さんから
            {hours != null ? `、${hours}時間` : ''} 応答がありません
          </p>
          <LeaveMenu row={row} actions={actions} />
        </div>
        <p className="mb-3.75 text-[13.5px] text-muted-foreground">
          {row.appLoggedOutAt
            ? 'スマホアプリからログアウト中です。まずは一声かけてみてください。'
            : '急かすものではありません。まずは一声かけてみてください。'}
        </p>
        <div className="grid gap-2.25">
          <Button
            type="button"
            variant="secondary"
            className={calmBtn}
            disabled={pending}
            onClick={() => actions.onConfirmAlive(row.subjectUserId)}
          >
            連絡がついた・無事です
          </Button>
          <Button
            type="button"
            variant="secondary"
            className={ghostBtn}
            disabled={pending}
            onClick={() => actions.onCannotReach(row.subjectUserId)}
          >
            連絡がつきません…
          </Button>
        </div>
      </div>
    </div>
  );
}

export function WatchDashboard({
  rows,
  now,
  actions,
  /**
   * 内部ヘッダー（アサトモWeb ブランド＋状態ピル）を出すか。既定 true（プレビュー等の単独利用）。
   * /watch では上位の共通ブランドヘッダー（アサトモWeb）があるので false にして二重ブランドを避ける。
   */
  showHeader = true,
}: {
  rows: DashboardRow[];
  now: Date;
  actions: WatchAction;
  showHeader?: boolean;
}) {
  const alerts = rows.filter((r) => r.isAlert);
  const calm = rows.filter((r) => !r.isAlert);
  return (
    <div className="mx-auto min-h-screen max-w-149 bg-background px-4.5 pt-5.5 pb-15 leading-[1.7]">
      {showHeader ? (
        <header className="mb-4.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-lg font-bold tracking-[0.02em]">
            <img
              src="/apple-touch-icon.png"
              alt=""
              aria-hidden
              width={24}
              height={24}
              className="block size-6 rounded-[7px] shadow-(--shadow-sm)"
            />
            アサトモWeb
          </div>
          {alerts.length > 0 ? (
            <Badge variant="warn" dot>
              要確認 {alerts.length}件
            </Badge>
          ) : (
            <Badge variant="good" dot>
              みんな元気そう
            </Badge>
          )}
        </header>
      ) : null}

      {rows.length === 0 ? (
        <p className="px-5 py-15 text-center text-(--ink-3)">
          まだ見守っている人がいません。招待リンクから始めましょう。
        </p>
      ) : null}

      {alerts.map((row) => (
        <AlertCard
          key={row.subjectUserId}
          row={row}
          now={now}
          actions={actions}
        />
      ))}
      {calm.map((row) => (
        <SubjectCard
          key={row.subjectUserId}
          row={row}
          now={now}
          actions={actions}
        />
      ))}
    </div>
  );
}
