import { Link } from '@tanstack/react-router';
import { type CSSProperties, useState } from 'react';

/**
 * ログイン後の共通ブランドヘッダー（ADR-0008 §実装決定・決定5/6）。
 *   - 左: 「アサトモWeb」ロゴ（ブランド表記。ADR-0008 決定6 を grill 2026-07-25 で改訂。
 *     アイコン意匠だけでは目覚ましアプリと区別しづらい実地の反証を受け、Web 面を
 *     自己識別できる「アサトモWeb」に。ハブ＝スポーク構造は不変で、家族名「アサトモ」
 *     単体はオンボーディング初回銘板に残す）。
 *   - 右: ハンバーガー。最頻でない管理をタブから追い出してここへ畳む。
 *     当面は「アカウント」1項目のみ（利用規約・プライバシーポリシーはページ整備後に追加）。
 *     ログアウトはメニューに直接置かず、アカウント画面に集約する。
 */
const barStyle: CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 25,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 16px',
  background: 'var(--bg)',
  borderBottom: '1px solid var(--line)',
};

export function BrandHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header style={barStyle}>
      <Link
        to="/me"
        aria-label="アサトモWeb ホームへ"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          textDecoration: 'none',
          color: 'var(--ink)',
        }}
      >
        <img
          src="/apple-touch-icon.png"
          alt=""
          aria-hidden
          width={22}
          height={22}
          style={{ display: 'block', borderRadius: 6 }}
        />
        <span
          style={{ fontSize: 17, fontWeight: 700, letterSpacing: '0.02em' }}
        >
          アサトモWeb
        </span>
      </Link>

      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="メニュー"
          aria-expanded={open}
          style={{
            appearance: 'none',
            background: 'none',
            border: 0,
            cursor: 'pointer',
            fontSize: 22,
            lineHeight: 1,
            color: 'var(--ink-2)',
            padding: '4px 6px',
            borderRadius: 8,
          }}
        >
          ☰
        </button>
        {open ? (
          <>
            <button
              type="button"
              aria-hidden
              onClick={() => setOpen(false)}
              className="rowmenu__backdrop"
            />
            <div
              className="rowmenu__pop"
              style={{
                position: 'absolute',
                right: 0,
                top: 'calc(100% + 6px)',
              }}
            >
              <Link
                to="/account"
                onClick={() => setOpen(false)}
                style={{
                  display: 'block',
                  padding: '10px 12px',
                  borderRadius: 8,
                  fontSize: 14,
                  color: 'var(--ink)',
                  textDecoration: 'none',
                }}
              >
                アカウント
              </Link>
            </div>
          </>
        ) : null}
      </div>
    </header>
  );
}
