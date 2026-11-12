import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import { authClient } from '../web/auth-client';

// src/domain/native-handoff.ts の CHALLENGE_RE と同じ（あちらは DB 層を引くのでクライアントへ import しない）。
const CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;

/**
 * Android アプリからの LINE ログイン入口（Custom Tab で開く）。
 *
 * ネイティブは Cookie ではなく bearer トークンでセッションを持つため、Google のような
 * id_token 直接交換ができない LINE では「Web の OAuth 往復を Custom Tab で通し、完了後に
 * /native/handoff が使い捨てコードを asatomo:// ディープリンクでアプリへ返し、アプリが
 * それをトークンに交換する」方式を取る。
 * この画面は読み込み直後に既存の Web と同じ LINE OAuth を開始するだけ（callbackURL を
 * handoff に向け、アプリが ?c= で渡した PKCE challenge を持ち回る点だけが Web の /login と異なる）。
 */
export const Route = createFileRoute('/native/line')({
  validateSearch: (search: Record<string, unknown>) => ({
    c: typeof search.c === 'string' ? search.c : '',
  }),
  component: NativeLineStart,
});

function NativeLineStart() {
  const { c } = Route.useSearch();
  // 形式外は載せない（better-auth の callbackURL 検証に弾かれる文字を持ち込まない）。
  // handoff 側が c 無しを bad_request としてアプリへ返す。
  const handoff = CHALLENGE_RE.test(c)
    ? `/native/handoff?c=${c}`
    : '/native/handoff';

  useEffect(() => {
    // 成功・失敗どちらも /native/handoff に着地させる（handoff がセッション有無で分岐）。
    void authClient.signIn.oauth2({
      providerId: 'line',
      callbackURL: handoff,
      errorCallbackURL: handoff,
    });
  }, [handoff]);

  return (
    <main className="grid min-h-screen place-items-center p-6 text-center font-[system-ui,sans-serif] text-[#555]">
      <p>LINE に移動しています…</p>
    </main>
  );
}
