import { useEffect, useState } from 'react';

/**
 * PWA インストール状態フック（ADR-0010）。なふだの usePwaInstall を移植。
 *   - Android: beforeinstallprompt を捕捉し promptInstall() で追加ダイアログを出す。
 *     イベントはハイドレーション前に発火するため __root の早期スクリプトが
 *     window.__pwaPrompt に退避しておく。
 *   - iOS: 自動プロンプトが無いので手動追加ガイドを出す（isIos で分岐）。
 *   - 却下は 7 日クールダウン（localStorage）で“たまに”再提示。
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

const STORAGE_KEY = 'asatomo-pwa-banner-dismissed';
const DISMISS_DAYS = 7;

export function isPwaBannerDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  const val = localStorage.getItem(STORAGE_KEY);
  if (!val) return false;
  return Date.now() < Number.parseInt(val, 10) + DISMISS_DAYS * 86_400_000;
}

export function dismissPwaBanner(): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  }
}

export function usePwaInstall() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isInStandaloneMode =
      'standalone' in navigator &&
      (navigator as { standalone?: boolean }).standalone === true;
    if (isIos && isInStandaloneMode) {
      setIsInstalled(true);
      return;
    }

    // 早期キャプチャ（__root のインライン）で既に取得済みなら反映。
    const captured = (window as { __pwaPrompt?: BeforeInstallPromptEvent })
      .__pwaPrompt;
    if (captured) setInstallPrompt(captured);

    const handler = (e: Event) => {
      e.preventDefault();
      const prompt = e as BeforeInstallPromptEvent;
      (window as { __pwaPrompt?: BeforeInstallPromptEvent }).__pwaPrompt =
        prompt;
      setInstallPrompt(prompt);
    };
    const installed = () => {
      setInstallPrompt(null);
      setIsInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  const promptInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') setInstallPrompt(null);
  };

  const isIos =
    typeof navigator !== 'undefined' &&
    /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isIosSafari =
    isIos && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(navigator.userAgent);
  const isInStandaloneMode =
    typeof navigator !== 'undefined' &&
    'standalone' in navigator &&
    (navigator as { standalone?: boolean }).standalone === true;

  return {
    canInstall: !!installPrompt,
    isIos: isIos && !isInStandaloneMode,
    isIosSafari: isIosSafari && !isInStandaloneMode,
    isInstalled,
    promptInstall,
  };
}
