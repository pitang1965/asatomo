/**
 * 死亡確認（見守りWeb）。重い操作を、重く・慎重に扱う。警告赤ではなく抑えた薔薇色。
 * クォーラム進捗・猶予期間・本人取消の可逆性を明示する（ADR-0001 の四重防御を言葉で伝える）。
 */
export function DeathConfirm({
  subjectName,
  votesFor,
  livingWatchers,
  graceHours,
  pending,
  onConfirm,
}: {
  subjectName: string;
  votesFor: number;
  livingWatchers: number;
  graceHours: number;
  pending?: boolean;
  onConfirm: () => void;
}) {
  const pct =
    livingWatchers > 0
      ? Math.min(100, Math.round((votesFor / livingWatchers) * 100))
      : 0;
  return (
    <div className="watch">
      <div className="grave">
        <div className="grave__kicker">最後の確認</div>
        <h2 className="grave__title">
          {subjectName}さんが亡くなられたと、確認しますか
        </h2>
        <p className="grave__body">
          この確認は、他の見守り者との合意と猶予期間（{graceHours}時間）を経て
          はじめて、{subjectName}
          さんの「最後のメッセージ」の開示につながります。
          一人の操作だけでは成立しません。
        </p>
        <div className="quorum">
          <div className="quorum__track">
            <i style={{ width: `${pct}%` }} />
          </div>
          <span className="quorum__n">
            見守り者 {livingWatchers}人中 {votesFor}人が確認
          </span>
        </div>
        <div className="reassure">
          🤍
          <span>
            {subjectName}
            さんが生きていれば、猶予期間中にご本人がいつでも取り消せます。慎重に。
          </span>
        </div>
        <button
          type="button"
          className="btn btn--grave"
          disabled={pending}
          onClick={onConfirm}
        >
          確認する
        </button>
      </div>
    </div>
  );
}
