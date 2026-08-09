import { Link } from '@tanstack/react-router';
import type { ReactElement, SVGProps } from 'react';
import { cn } from '@/lib/utils';
import type { TabId } from './nav';

/**
 * 見守りWeb の下タブ（ADR-0008）。全員固定の3つ。役割で出し分けない。
 * ラベルは短く温かい「仲間」だが、開いた先の画面内総称は「見守っている人」を保つ（決定4）。
 * 表示は activeTab(pathname) が非 null の画面のみ（_app 側で制御）。
 *
 * アイコンは絵文字をやめてインライン SVG（線画・stroke=currentColor）にした。全 OS で字形が
 * 一貫し、選択色（accent/ink-3）が currentColor 経由でそのまま乗る。パスは Lucide 由来。
 */

/** わたし＝ひとり（Lucide user）。 */
function MeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Glyph {...props}>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </Glyph>
  );
}

/** 仲間＝ふたり以上（Lucide users）。向きの総称ではなくタブの温かい入口ラベル用の絵。 */
function WatchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Glyph {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Glyph>
  );
}

/** 伝言＝封筒（Lucide mail）。 */
function MessagesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Glyph {...props}>
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </Glyph>
  );
}

/** 共通の線画設定（24 viewBox・stroke=currentColor）。 */
function Glyph({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={22}
      height={22}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

const ITEMS: {
  tab: TabId;
  to: string;
  label: string;
  Icon: (p: SVGProps<SVGSVGElement>) => ReactElement;
}[] = [
  { tab: 'me', to: '/me', label: 'わたし', Icon: MeIcon },
  { tab: 'watch', to: '/watch', label: '仲間', Icon: WatchIcon },
  { tab: 'messages', to: '/messages', label: '伝言', Icon: MessagesIcon },
];

export function BottomTabs({ active }: { active: TabId }) {
  return (
    <nav
      aria-label="主要ナビゲーション"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgb(0_0_0/0.05)]"
    >
      {ITEMS.map(({ tab, to, label, Icon }) => {
        const on = tab === active;
        return (
          <Link
            key={tab}
            to={to}
            aria-current={on ? 'page' : undefined}
            className={cn(
              'flex flex-col items-center justify-center gap-0.75 px-1 py-2.25 no-underline',
              on ? 'font-bold text-primary' : 'font-semibold text-(--ink-3)',
            )}
          >
            <Icon />
            <span className="text-[11px]">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
