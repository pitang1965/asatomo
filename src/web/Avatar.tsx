import type { CSSProperties } from 'react';

/**
 * 円形プロフィールアバター。OAuth の user.image があれば画像、無ければ頭文字1字で代替。
 * アカウント画面（/account）への入口とヘッダーで共有する。
 *
 * color を渡すと頭文字フォールバックの地をその色・文字を白にする（見守りダッシュボードで
 * 人ごとに色分けして一覧の視認性を上げる用途。/watch）。未指定なら neutral（surface-2）。
 */
export function Avatar({
  name,
  image,
  size = 32,
  color,
}: {
  name: string;
  image?: string | null;
  size?: number;
  color?: string;
}) {
  const base: CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    flexShrink: 0,
    border: color ? 'none' : '1px solid var(--line)',
  };
  if (image)
    return (
      <img
        src={image}
        alt=""
        aria-hidden
        width={size}
        height={size}
        style={{ ...base, objectFit: 'cover', display: 'block' }}
      />
    );
  const initial = name.trim().charAt(0) || '?';
  return (
    <span
      aria-hidden
      style={{
        ...base,
        display: 'grid',
        placeItems: 'center',
        background: color ?? 'var(--surface-2)',
        color: color ? '#fff' : 'var(--ink)',
        fontWeight: 700,
        fontSize: Math.round(size * 0.45),
        lineHeight: 1,
      }}
    >
      {initial}
    </span>
  );
}
