import { Link } from '@tanstack/react-router';
import type { CSSProperties } from 'react';

/**
 * 「ページが見つからない」共通カード。2か所で同一表示にするため切り出す:
 *   - アプリ全体の未マッチURL（__root の notFoundComponent。例: /xxx）
 *   - ルート単位のデータ無し中立ページ（/disclosure の unavailable。ADR-0011 §2）
 * ブランド（アサトモWeb）を出し、認証状態に依らず正しく振り分く「/」へ戻す導線を置く。
 */
const page: CSSProperties = {
  background: 'var(--bg)',
  minHeight: '100vh',
  fontFamily: 'var(--font-jp)',
  display: 'grid',
  placeItems: 'center',
  padding: 24,
};

const card: CSSProperties = {
  background: 'var(--surface)',
  borderRadius: 20,
  padding: '32px 28px',
  maxWidth: 380,
  width: '100%',
  boxShadow: '0 8px 32px rgb(0 0 0 / 0.08)',
  textAlign: 'center',
};

export function NotFoundCard() {
  return (
    <div style={page}>
      <div style={card}>
        {/* ブランドのワードマーク（BrandHeader と同じ意匠: アイコン＋「アサトモWeb」）。 */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 20,
          }}
        >
          <img
            src="/apple-touch-icon.png"
            alt=""
            aria-hidden
            width={24}
            height={24}
            style={{ display: 'block', borderRadius: 6 }}
          />
          <span
            style={{
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: '0.02em',
              color: 'var(--ink)',
            }}
          >
            アサトモWeb
          </span>
        </div>

        <h1 style={{ fontSize: 18, color: 'var(--ink)', margin: '0 0 8px' }}>
          お探しのページは見つかりませんでした
        </h1>
        <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: '0 0 24px' }}>
          URL が変わったか、削除された可能性があります。
        </p>

        <Link
          to="/"
          style={{
            display: 'block',
            width: '100%',
            boxSizing: 'border-box',
            padding: '12px 16px',
            borderRadius: 12,
            fontWeight: 600,
            fontSize: 14,
            background: 'var(--accent)',
            color: '#fff',
            textDecoration: 'none',
          }}
        >
          トップページへ
        </Link>
      </div>
    </div>
  );
}
