import { type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

/**
 * 行の縦3点（⋮）メニュー。稀・管理的な操作（見守り解除など）を畳んで目立たせない
 * （grill 2026-07-21 のフィードバック）。段階は ⋮ →「メニュー（アクション名）」→
 * 「確認（本文＋実行/キャンセル）」の3つ。外側クリックは透明バックドロップで閉じる。
 * 確認本文（向きの明示・通知予告・警告など）は呼び出し側が渡す。
 */
// ポップアップ共通（narrow/wide で padding が異なるため padding は各所で付ける）。
const popBase =
  'absolute right-0 top-[calc(100%+4px)] z-21 rounded-xl border border-border bg-card shadow-(--shadow-sm)';
// 確認段のボタン（幅auto・角丸13・13px・太字）。
const actBtn =
  'h-auto rounded-[13px] px-3.75 py-2.25 text-[13px] font-semibold';

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
    <div className="relative flex-none">
      <button
        type="button"
        className="cursor-pointer rounded-lg border-0 bg-transparent px-1.75 py-1 text-lg leading-none text-(--ink-3)"
        aria-label="メニュー"
        aria-haspopup="menu"
        onClick={() => setPhase(phase === 'idle' ? 'menu' : 'idle')}
      >
        ⋮
      </button>
      {phase !== 'idle' ? (
        <button
          type="button"
          className="fixed inset-0 z-20 cursor-default border-0 bg-transparent"
          aria-label="閉じる"
          onClick={close}
        />
      ) : null}
      {phase === 'menu' ? (
        <div className={`${popBase} min-w-47.5 p-1.5`} role="menu">
          <button
            type="button"
            className="w-full cursor-pointer rounded-lg border-0 bg-transparent px-2.5 py-2.25 text-left text-[13px] text-(--crit)"
            role="menuitem"
            onClick={() => setPhase('confirm')}
          >
            {actionLabel}
          </button>
        </div>
      ) : null}
      {phase === 'confirm' ? (
        <div className={`${popBase} w-66 p-3.25`}>
          <div className="text-[13px] leading-[1.85] text-muted-foreground">
            {confirmBody}
          </div>
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className={`${actBtn} border border-[color-mix(in_oklab,var(--crit)_45%,var(--line))] bg-transparent text-(--crit) hover:bg-(--crit)/10`}
              disabled={pending}
              aria-busy={pending}
              onClick={onConfirm}
            >
              {pending && <Spinner />}
              {pending ? '処理中…' : (confirmLabel ?? actionLabel)}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className={`${actBtn} border border-border`}
              disabled={pending}
              onClick={close}
            >
              キャンセル
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
