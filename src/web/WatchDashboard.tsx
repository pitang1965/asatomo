import type { DashboardRow } from '../domain/queries';
import { recentActivityText } from '../domain/recent-activity';
import { RowMenu } from './RowMenu';

/**
 * 見守りWeb ダッシュボード（プレゼンテーション）。データ取得・アクションは props で受け、
 * TanStack Start のルート/サーバー関数から注入する（このコンポーネントは純粋）。
 * 近況は過去形＋経過時間のみ（監視感を出さない）。アラート中の本人を上に。
 */

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
      <span className="pill pill--warn">
        <span className="pill__d" />
        要確認
      </span>
    );
  if (row.travelUntil && row.travelUntil > now)
    return (
      <span className="pill pill--travel">
        <span className="pill__d" />
        旅行
      </span>
    );
  if (row.currentPresence === 'sleeping')
    return (
      <span className="pill pill--night">
        <span className="pill__d" />
        就寝中
      </span>
    );
  return (
    <span className="pill pill--good">
      <span className="pill__d" />
      元気そう
    </span>
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
    <div className="card">
      <span
        className="card__avatar"
        style={{ background: avatarColor(row.subjectUserId) }}
      >
        {row.name.slice(0, 1)}
      </span>
      <div className="card__who">
        <div className="card__name">{row.name}</div>
        <div className="card__status">{statusText}</div>
        {row.appLoggedOutAt ? (
          <div className="card__note">
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
    <div className="alert">
      <div className="alert__stripe" />
      <div className="alert__in">
        <div className="alert__head">
          <p className="alert__title">
            {row.name}さんから
            {hours != null ? `、${hours}時間` : ''} 応答がありません
          </p>
          <LeaveMenu row={row} actions={actions} />
        </div>
        <p className="alert__body">
          {row.appLoggedOutAt
            ? 'スマホアプリからログアウト中です。まずは一声かけてみてください。'
            : '急かすものではありません。まずは一声かけてみてください。'}
        </p>
        <div className="alert__acts">
          <button
            type="button"
            className="btn btn--calm"
            disabled={pending}
            onClick={() => actions.onConfirmAlive(row.subjectUserId)}
          >
            連絡がついた・無事です
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={pending}
            onClick={() => actions.onCannotReach(row.subjectUserId)}
          >
            連絡がつきません…
          </button>
        </div>
      </div>
    </div>
  );
}

export function WatchDashboard({
  rows,
  now,
  actions,
}: {
  rows: DashboardRow[];
  now: Date;
  actions: WatchAction;
}) {
  const alerts = rows.filter((r) => r.isAlert);
  const calm = rows.filter((r) => !r.isAlert);
  return (
    <div className="watch">
      <header className="watch__head">
        <div className="watch__brand">
          <span className="watch__sun" />
          みまもり
        </div>
        {alerts.length > 0 ? (
          <span className="pill pill--warn">
            <span className="pill__d" />
            要確認 {alerts.length}件
          </span>
        ) : (
          <span className="pill pill--good">
            <span className="pill__d" />
            みんな元気そう
          </span>
        )}
      </header>

      {rows.length === 0 ? (
        <p className="watch__empty">
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
