import type { CSSProperties } from 'react';

/**
 * 円形プロフィールアバター。OAuth の user.image があれば画像、無ければ頭文字1字で代替。
 * アカウント画面（/account）への入口とヘッダーで共有する。
 */
export function Avatar({
  name,
  image,
  size = 32,
}: {
  name: string;
  image?: string | null;
  size?: number;
}) {
  const base: CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    flexShrink: 0,
    border: '1px solid var(--line)',
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
        background: 'var(--surface-2)',
        color: 'var(--ink)',
        fontWeight: 700,
        fontSize: Math.round(size * 0.45),
        lineHeight: 1,
      }}
    >
      {initial}
    </span>
  );
}
