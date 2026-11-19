import { useEffect, useState } from 'react';

/**
 * LINE 以外のアプリ内ブラウザ（WebView）判定。LINE・Instagram 等の中で開かれると Cookie が隔離され、
 * OAuth の state Cookie が戻り時に読めず「状態不一致」でログインが失敗する（Google も
 * 埋め込み WebView を disallowed_useragent で拒否する。業界共通の制約）。UA で既知の
 * アプリ内ブラウザを検知し、通常ブラウザで開き直すよう案内する。
 */
function isInAppBrowser(ua: string): boolean {
  // LINE は isLineUa で先に判定するので、ここには含めない
  return /FBAN|FBAV|FB_IAB|Instagram|Twitter|TikTok|musical_ly|Bytedance|KAKAOTALK|MicroMessenger/i.test(
    ua,
  );
}

const isLineUa = (ua: string) => /\bLine\//i.test(ua);

/** ログイン導線（/login・/join）に置く、アプリ内ブラウザ向けの案内。通常ブラウザでは何も出さない。 */
export function InAppBrowserNotice() {
  // 判定はクライアントでのみ行う（SSR に navigator が無い）。初期 null で SSR と一致させ、
  // マウント後に切り替える（ハイドレーション不整合を避ける）。
  const [mode, setMode] = useState<'line' | 'other' | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const ua = navigator.userAgent;
    setMode(isLineUa(ua) ? 'line' : isInAppBrowser(ua) ? 'other' : null);
  }, []);
  if (!mode) return null;

  const copyUrl = () => {
    const url = window.location.href;
    navigator.clipboard?.writeText(url).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => {
        // クリップボード不可の環境では選択できるよう prompt で提示。
        window.prompt(
          'このURLをコピーして、ChromeやSafariで開いてください',
          url,
        );
      },
    );
  };

  // LINE はこのクエリが付いた URL を既定のブラウザで開く。?redirect= 等は残す
  const externalHref = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('openExternalBrowser', '1');
    return url.toString();
  };

  const btn =
    'mt-2.5 block w-full cursor-pointer rounded-[10px] border border-[#fdba74] bg-white px-3 py-2 text-center text-[13px] font-semibold text-[#9a3412] no-underline';

  return (
    <div className="mt-4 rounded-xl border border-[#fdba74] bg-[#fff7ed] px-3.5 py-3 text-left text-[13px] leading-[1.7] text-[#9a3412]">
      <strong>
        {mode === 'line'
          ? 'LINEの中で開かれています。'
          : 'アプリ内の画面で開かれています。'}
      </strong>
      <br />
      {mode === 'line' ? (
        <>
          このままだとログインが「状態不一致」で失敗することがあります。下のボタンで、いつものブラウザ（Chrome
          や Safari）で開き直してください。
          <a href={externalHref()} className={btn}>
            ブラウザで開く
          </a>
        </>
      ) : (
        <>
          このままだとログインが「状態不一致」で失敗することがあります。右上のメニュー（⋮
          や … ）から
          <strong>「ブラウザで開く」/「既定のブラウザで開く」</strong>
          を選び、Chrome や Safari で開き直してください。
          <button type="button" onClick={copyUrl} className={btn}>
            {copied ? '✓ URLをコピーしました' : 'このページのURLをコピー'}
          </button>
        </>
      )}
    </div>
  );
}
