import { type CSSProperties, useEffect, useState } from 'react';
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
 * asatomo は Tailwind 非使用のため watch.css の CSS 変数＋インラインで描く。
 */
const wrap: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  margin: '10px 16px 0',
  padding: '10px 12px',
  background: 'var(--accent-soft)',
  border: '1px solid var(--line)',
  borderRadius: 12,
  fontSize: 13,
  color: 'var(--ink)',
  lineHeight: 1.4,
};
const closeBtn: CSSProperties = {
  appearance: 'none',
  background: 'none',
  border: 0,
  cursor: 'pointer',
  fontSize: 18,
  lineHeight: 1,
  color: 'var(--ink-3)',
  padding: '2px 4px',
};
const addBtn: CSSProperties = {
  appearance: 'none',
  border: 0,
  cursor: 'pointer',
  background: 'var(--accent)',
  color: '#fff',
  fontSize: 13,
  fontWeight: 700,
  padding: '7px 14px',
  borderRadius: 9,
  whiteSpace: 'nowrap',
};

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
      <div style={wrap}>
        <span>
          {isIosSafari
            ? '共有（□↑）→「ホーム画面に追加」で、いつでもすぐ開けます'
            : 'ブラウザのメニュー →「ホーム画面に追加」で、いつでもすぐ開けます'}
        </span>
        <button
          type="button"
          onClick={dismiss}
          style={closeBtn}
          aria-label="閉じる"
        >
          ✕
        </button>
      </div>
    );
  }

  if (canInstall) {
    return (
      <div style={wrap}>
        <span>ホーム画面に追加すると、いつでもすぐ開けます</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button type="button" onClick={promptInstall} style={addBtn}>
            追加する
          </button>
          <button
            type="button"
            onClick={dismiss}
            style={closeBtn}
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
