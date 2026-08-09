import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  dismissPwaBanner,
  isPwaBannerDismissed,
  usePwaInstall,
} from './usePwaInstall';

/**
 * PWA「ホーム画面に追加」バナー（ADR-0010）。誰にでも低刺激で促す消せるバナー。
 *   - Android: beforeinstallprompt 取得済みなら「追加する」ボタン。
 *   - iOS: 手動追加ガイド（Safari は共有→ホーム画面に追加）。
 *   - 却下は 7 日クールダウン。既にインストール済み・未対応環境では何も出さない。
 */
const wrapCls =
  'mx-4 mt-2.5 flex items-center justify-between gap-2.5 rounded-xl border border-border bg-(--accent-soft) px-3 py-2.5 text-[13px] leading-[1.4] text-foreground';
const closeBtnCls =
  'cursor-pointer border-0 bg-transparent px-1 py-0.5 text-lg leading-none text-(--ink-3)';

export function PwaInstallBanner() {
  const { canInstall, isIos, isIosSafari, isInstalled, promptInstall } =
    usePwaInstall();
  // SSR と初回クライアント描画を一致させる（hydration mismatch 回避）。
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    setMounted(true);
    setDismissed(isPwaBannerDismissed());
  }, []);

  if (!mounted || isInstalled || dismissed) return null;

  const dismiss = () => {
    dismissPwaBanner();
    setDismissed(true);
  };

  if (isIos) {
    return (
      <div className={wrapCls}>
        <span>
          {isIosSafari
            ? '共有（□↑）→「ホーム画面に追加」で、いつでもすぐ開けます'
            : 'ブラウザのメニュー →「ホーム画面に追加」で、いつでもすぐ開けます'}
        </span>
        <button
          type="button"
          onClick={dismiss}
          className={closeBtnCls}
          aria-label="閉じる"
        >
          ✕
        </button>
      </div>
    );
  }

  if (canInstall) {
    return (
      <div className={wrapCls}>
        <span>ホーム画面に追加すると、いつでもすぐ開けます</span>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            onClick={promptInstall}
            className="h-auto rounded-[9px] px-3.5 py-1.75 text-[13px] font-bold whitespace-nowrap"
          >
            追加する
          </Button>
          <button
            type="button"
            onClick={dismiss}
            className={closeBtnCls}
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  return null;
}
