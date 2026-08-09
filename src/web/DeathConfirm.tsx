import { Button } from '@/components/ui/button';

/**
 * 死亡確認（見守りWeb）。「連絡を試みた結果の報告」として3択で聞く:
 *   亡くなられていません（代理確認） / 未確認です（何もしない） / 亡くなられました（確認の一票）。
 * 重い操作を、重く・慎重に扱う。警告赤ではなく抑えた薔薇色。
 * クォーラム進捗・猶予期間・本人取消の可逆性を明示する（ADR-0001 の四重防御を言葉で伝える）。
 */
// 旧 .watch コンテナ（560幅・中央寄せ）。
const watchCls =
  'mx-auto min-h-screen max-w-149 bg-background px-4.5 pt-5.5 pb-15 leading-[1.7]';
// 旧 .btn（全幅・角丸13・14.5px・太字）。calm=緑/ghost=surface-2+枠/grave=--crit アウトライン。
const btnBase =
  'h-auto w-full rounded-[13px] py-3.25 text-[14.5px] font-semibold';
const calmBtn = `${btnBase} bg-(--good) text-white hover:bg-(--good)/90`;
const ghostBtn = `${btnBase} border border-border`;
const graveBtn = `${btnBase} border border-[color-mix(in_oklab,var(--crit)_45%,var(--line))] bg-transparent text-(--crit) hover:bg-(--crit)/10`;

export function DeathConfirm({
  subjectName,
  votesFor,
  livingWatchers,
  graceHours,
  pending,
  myVoteActive,
  onAlive,
  onUnknown,
  onConfirm,
  onWithdraw,
}: {
  subjectName: string;
  votesFor: number;
  livingWatchers: number;
  graceHours: number;
  pending?: boolean;
  /** 閲覧者が「亡くなられました」と報告（投票）済みか。true なら変更導線に切り替わる。 */
  myVoteActive?: boolean;
  /** 亡くなられていません = 代理確認（投票済みなら取り下げ→代理確認）。 */
  onAlive: () => void;
  /** 未確認です = 何もしない（ダッシュボードへ戻る）。 */
  onUnknown: () => void;
  /** 亡くなられました = 死亡確認の一票。 */
  onConfirm: () => void;
  /** 確認の一票だけを取り下げる（未確認に戻す）。 */
  onWithdraw?: () => void;
}) {
  const pct =
    livingWatchers > 0
      ? Math.min(100, Math.round((votesFor / livingWatchers) * 100))
      : 0;

  const choice = (
    label: string,
    caption: string,
    btnCls: string,
    onClick: () => void,
  ) => (
    <div className="mt-3">
      <Button
        type="button"
        variant="secondary"
        className={btnCls}
        disabled={pending}
        onClick={onClick}
      >
        {label}
      </Button>
      <p className="mt-1.5 text-center text-xs text-(--ink-3)">{caption}</p>
    </div>
  );

  return (
    <div className={watchCls}>
      <div className="rounded-2xl border border-[color-mix(in_oklab,var(--crit)_35%,var(--line))] bg-card p-5.5 shadow-(--shadow-sm)">
        <div className="mb-2.5 text-[11.5px] font-bold uppercase tracking-[0.14em] text-(--crit)">
          最後の確認
        </div>
        <h2 className="mb-3 text-[19px] leading-normal">
          {subjectName}さんと、連絡はつきましたか
        </h2>
        <p className="mb-4 text-[13.5px] text-muted-foreground">
          電話や訪問などで連絡を試みた結果を教えてください。
          「亡くなられました」は一人の報告だけでは成立せず、他の見守り者との合意と
          猶予期間（{graceHours}時間）を経てはじめて、{subjectName}
          さんの「最後の伝言」の開示につながります。
        </p>
        <div className="mb-2 flex items-center gap-3 rounded-xl bg-secondary px-3.75 py-3.25">
          <div className="h-1.75 flex-1 overflow-hidden rounded-full bg-border">
            <i
              className="block h-full rounded-full bg-(--crit)"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="whitespace-nowrap text-[12.5px] font-semibold text-muted-foreground tabular-nums">
            見守り者 {livingWatchers}人中 {votesFor}
            人が「亡くなられました」と報告
          </span>
        </div>
        <div className="mt-3.5 mb-4.5 flex gap-2.25 rounded-xl bg-(--good-soft) px-3.5 py-3 text-[12.5px] text-[color-mix(in_oklab,var(--good)_80%,var(--ink))]">
          🤍
          <span>
            {subjectName}
            さんが生きていれば、猶予期間中にご本人がいつでも取り消せます。慎重に。
          </span>
        </div>

        {myVoteActive ? (
          <>
            <p className="mb-4 text-[13.5px] text-muted-foreground">
              あなたは「亡くなられました」と報告済みです。状況が変わったときは、いつでも変更できます。
            </p>
            {choice(
              '亡くなられていません',
              '取り下げて、無事を全員に知らせます',
              calmBtn,
              onAlive,
            )}
            {onWithdraw
              ? choice(
                  '未確認に戻す',
                  '報告だけを取り下げます',
                  ghostBtn,
                  onWithdraw,
                )
              : null}
          </>
        ) : (
          <>
            {choice(
              '亡くなられていません',
              '見守りの全員に知らせます',
              calmBtn,
              onAlive,
            )}
            {choice('未確認です', 'あとで報告できます', ghostBtn, onUnknown)}
            {choice(
              '亡くなられました',
              '合意と猶予期間を経てはじめて成立します',
              graveBtn,
              onConfirm,
            )}
          </>
        )}
      </div>
    </div>
  );
}
