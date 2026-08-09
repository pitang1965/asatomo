import { Link } from '@tanstack/react-router';
import { useState } from 'react';

/**
 * ログイン後の共通ブランドヘッダー（ADR-0008 §実装決定・決定5/6）。
 *   - 左: 「アサトモWeb」ロゴ（ブランド表記。ADR-0008 決定6 を grill 2026-07-25 で改訂。
 *     アイコン意匠だけでは目覚ましアプリと区別しづらい実地の反証を受け、Web 面を
 *     自己識別できる「アサトモWeb」に。ハブ＝スポーク構造は不変で、家族名「アサトモ」
 *     単体はオンボーディング初回銘板に残す）。
 *   - 右: ハンバーガー。最頻でない管理をタブから追い出してここへ畳む。
 *     「アカウント」＋（区切り線の下に）利用規約・プライバシーポリシー。
 *     ログアウトはメニューに直接置かず、アカウント画面に集約する。
 */
const itemCls =
  'block rounded-lg px-3 py-2.5 text-sm text-foreground no-underline';

export function BrandHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-25 flex items-center justify-between border-b border-border bg-background px-4 py-2.5">
      <Link
        to="/me"
        aria-label="アサトモWeb ホームへ"
        className="inline-flex items-center gap-2 text-foreground no-underline"
      >
        <img
          src="/apple-touch-icon.png"
          alt=""
          aria-hidden
          width={22}
          height={22}
          className="block rounded-md"
        />
        <span className="text-[17px] font-bold tracking-[0.02em]">
          アサトモWeb
        </span>
      </Link>

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="メニュー"
          aria-expanded={open}
          className="cursor-pointer rounded-lg px-1.5 py-1 text-[22px] leading-none text-muted-foreground"
        >
          ☰
        </button>
        {open ? (
          <>
            <button
              type="button"
              aria-hidden
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-20 cursor-default border-0 bg-transparent"
            />
            <div className="absolute right-0 top-[calc(100%+6px)] z-21 min-w-47.5 rounded-xl border border-border bg-card p-1.5 shadow-(--shadow-sm)">
              <Link
                to="/account"
                onClick={() => setOpen(false)}
                className={itemCls}
              >
                アカウント
              </Link>
              <Link
                to="/terms"
                onClick={() => setOpen(false)}
                className={`${itemCls} border-t border-border`}
              >
                利用規約
              </Link>
              <Link
                to="/privacy"
                onClick={() => setOpen(false)}
                className={itemCls}
              >
                プライバシーポリシー
              </Link>
            </div>
          </>
        ) : null}
      </div>
    </header>
  );
}
