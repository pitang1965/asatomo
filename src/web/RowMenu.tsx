import { type ReactNode, useState } from 'react';

/**
 * 行の縦3点（⋮）メニュー。稀・管理的な操作（見守り解除など）を畳んで目立たせない
 * （grill 2026-07-21 のフィードバック）。段階は ⋮ →「メニュー（アクション名）」→
 * 「確認（本文＋実行/キャンセル）」の3つ。外側クリックは透明バックドロップで閉じる。
 * 確認本文（向きの明示・通知予告・警告など）は呼び出し側が渡す。
 */
export function RowMenu({
  actionLabel,
  confirmLabel,
  confirmBody,
  onConfirm,
  pending = false,
}: {
  /** メニュー項目のラベル（例:「見守りをお願いするのをやめる」）。 */
  actionLabel: string;
  /** 確認段の実行ボタンのラベル。省略時は actionLabel（長い時は短い語を渡す）。 */
  confirmLabel?: string;
  /** 確認段の本文。 */
  confirmBody: ReactNode;
  onConfirm: () => void;
  pending?: boolean;
}) {
  const [phase, setPhase] = useState<'idle' | 'menu' | 'confirm'>('idle');
  const close = () => setPhase('idle');
  return (
    <div className="rowmenu">
      <button
        type="button"
        className="rowmenu__dots"
        aria-label="メニュー"
        aria-haspopup="menu"
        onClick={() => setPhase(phase === 'idle' ? 'menu' : 'idle')}
      >
        ⋮
      </button>
      {phase !== 'idle' ? (
        <button
          type="button"
          className="rowmenu__backdrop"
          aria-label="閉じる"
          onClick={close}
        />
      ) : null}
      {phase === 'menu' ? (
        <div className="rowmenu__pop" role="menu">
          <button
            type="button"
            className="rowmenu__item"
            role="menuitem"
            onClick={() => setPhase('confirm')}
          >
            {actionLabel}
          </button>
        </div>
      ) : null}
      {phase === 'confirm' ? (
        <div className="rowmenu__pop rowmenu__pop--wide">
          <div className="rowmenu__confirm">{confirmBody}</div>
          <div className="rowmenu__acts">
            <button
              type="button"
              className="btn btn--grave"
              disabled={pending}
              onClick={onConfirm}
            >
              {pending ? '処理中…' : (confirmLabel ?? actionLabel)}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={pending}
              onClick={close}
            >
              キャンセル
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
