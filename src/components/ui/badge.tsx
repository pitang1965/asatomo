import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * asatomo 版 Badge。watch.css の .pill（角丸フル・12px太字・色分きの前景＋淡い地）を
 * バリアントとして畳んだもの。dot を付けると先頭に 7px のドットが出る（色は bg-current で
 * 前景色を継承＝各バリアントのドット色と一致する）。
 * good/night/travel/warn はダッシュボードのステータス、muted は中立の注記ラベル用。
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap',
  {
    variants: {
      variant: {
        good: 'bg-(--good-soft) text-(--good)',
        night:
          'bg-[color-mix(in_oklab,var(--night)_15%,transparent)] text-(--night)',
        travel: 'bg-secondary text-(--ink-3)',
        warn: 'bg-(--warn-soft) text-(--warn)',
        muted: 'bg-muted text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'muted' },
  },
);

function Badge({
  className,
  variant,
  dot = false,
  children,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { dot?: boolean }) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    >
      {dot ? (
        <span
          aria-hidden
          className="size-1.75 shrink-0 rounded-full bg-current"
        />
      ) : null}
      {children}
    </span>
  );
}

export { Badge, badgeVariants };
