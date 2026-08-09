import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import { authClient } from '../web/auth-client';

/**
 * Android アプリからの LINE ログイン入口（Custom Tab で開く）。
 *
 * ネイティブは Cookie ではなく bearer トークンでセッションを持つため、Google のような
 * id_token 直接交換ができない LINE では「Web の OAuth 往復を Custom Tab で通し、完了後に
 * /native/handoff が bearer トークンを asatomo:// ディープリンクでアプリへ返す」方式を取る。
 * この画面は読み込み直後に既存の Web と同じ LINE OAuth を開始するだけ（callbackURL を
 * handoff に向ける点だけが Web の /login と異なる）。
 */
export const Route = createFileRoute('/native/line')({
  component: NativeLineStart,
});

function NativeLineStart() {
  useEffect(() => {
    // 成功・失敗どちらも /native/handoff に着地させる（handoff がセッション有無で分岐）。
    void authClient.signIn.oauth2({
      providerId: 'line',
      callbackURL: '/native/handoff',
      errorCallbackURL: '/native/handoff',
    });
  }, []);

  return (
    <main className="grid min-h-screen place-items-center p-6 text-center font-[system-ui,sans-serif] text-[#555]">
      <p>LINE に移動しています…</p>
    </main>
  );
}
