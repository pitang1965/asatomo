/**
 * 死亡確認（見守りWeb）。「連絡を試みた結果の報告」として3択で聞く:
 *   亡くなられていません（代理確認） / 未確認です（何もしない） / 亡くなられました（確認の一票）。
 * 重い操作を、重く・慎重に扱う。警告赤ではなく抑えた薔薇色。
 * クォーラム進捗・猶予期間・本人取消の可逆性を明示する（ADR-0001 の四重防御を言葉で伝える）。
 */
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
    className: string,
    onClick: () => void,
  ) => (
    <div style={{ marginTop: 12 }}>
      <button
        type="button"
        className={`btn ${className}`}
        style={{ width: '100%' }}
        disabled={pending}
        onClick={onClick}
      >
        {label}
      </button>
      <p
        style={{
          fontSize: 12,
          color: 'var(--ink-3)',
          margin: '6px 0 0',
          textAlign: 'center',
        }}
      >
        {caption}
      </p>
    </div>
  );

  return (
    <div className="watch">
      <div className="grave">
        <div className="grave__kicker">最後の確認</div>
        <h2 className="grave__title">
          {subjectName}さんと、連絡はつきましたか
        </h2>
        <p className="grave__body">
          電話や訪問などで連絡を試みた結果を教えてください。
          「亡くなられました」は一人の報告だけでは成立せず、他の見守り者との合意と
          猶予期間（{graceHours}時間）を経てはじめて、{subjectName}
          さんの「最後の伝言」の開示につながります。
        </p>
        <div className="quorum">
          <div className="quorum__track">
            <i style={{ width: `${pct}%` }} />
          </div>
          <span className="quorum__n">
            見守り者 {livingWatchers}人中 {votesFor}
            人が「亡くなられました」と報告
          </span>
        </div>
        <div className="reassure">
          🤍
          <span>
            {subjectName}
            さんが生きていれば、猶予期間中にご本人がいつでも取り消せます。慎重に。
          </span>
        </div>

        {myVoteActive ? (
          <>
            <p className="grave__body">
              あなたは「亡くなられました」と報告済みです。状況が変わったときは、いつでも変更できます。
            </p>
            {choice(
              '亡くなられていません',
              '取り下げて、無事を全員に知らせます',
              'btn--calm',
              onAlive,
            )}
            {onWithdraw
              ? choice(
                  '未確認に戻す',
                  '報告だけを取り下げます',
                  'btn--ghost',
                  onWithdraw,
                )
              : null}
          </>
        ) : (
          <>
            {choice(
              '亡くなられていません',
              '見守りの全員に知らせます',
              'btn--calm',
              onAlive,
            )}
            {choice(
              '未確認です',
              'あとで報告できます',
              'btn--ghost',
              onUnknown,
            )}
            {choice(
              '亡くなられました',
              '合意と猶予期間を経てはじめて成立します',
              'btn--grave',
              onConfirm,
            )}
          </>
        )}
      </div>
    </div>
  );
}
