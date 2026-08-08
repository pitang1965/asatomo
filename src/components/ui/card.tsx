import type * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * asatomo 版の薄い Card。見た目（地色・角丸・padding・影）だけを一元管理し、
 * レイアウト（max-width / margin など）は呼び出し側で className に付ける。
 * 既定と違う密度にしたい画面（例: /me の密なカード）は className で上書きする
 * （cn=twMerge が rounded 系や padding 系の衝突を解決し、後勝ちになる）。
 * Shadcn の CardHeader/CardContent 等は意図的に持たない（asatomo のカードは
 * 構造がまちまちで、意見の強い分割が合わないため）。
 */
function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn('rounded-2xl bg-card p-5 shadow-(--shadow-sm)', className)}
      {...props}
    />
  );
}

export { Card };
