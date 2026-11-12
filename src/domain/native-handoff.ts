import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { verification } from '../db/schema';

/**
 * ネイティブ LINE ログインの受け渡しコード（使い捨て・短命・PKCE 付き）。
 *
 * asatomo:// ディープリンクは他アプリに横取りされうるので、リンクにはセッショントークンを
 * 載せず、このコードだけを載せる。コードは「ログインを開始したアプリだけが知る検証子
 * （verifier）」と揃って初めてトークンに交換できる（RFC 7636 と同じ考え方）。
 *   - コードだけ横取りしても verifier が無いので交換できない。
 *   - 他人が作ったコードを本物のアプリに踏ませても verifier が合わないのでログインされない。
 * 保存先は better-auth の verification テーブル（短命の値置き場として同居）。
 *
 * shortcut: 同じ asatomo:// を登録した悪意あるアプリが「自分の verifier で自分からログインを
 * 始める」攻撃は防げない（ブラウザに Cookie が残っていればコードが発行され、アプリ選択画面で
 * そのアプリが選ばれると交換される）。防げるのは受け身の横取りだけ。App Links（検証済み https）
 * 導入時に解消する。
 */

const TTL_MS = 2 * 60_000;
const PREFIX = 'native-handoff:';

/** challenge の形式: SHA-256 の base64url（パディング無し）= 43 文字。 */
export const CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function challengeOf(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  );
  return base64Url(new Uint8Array(digest));
}

/** セッショントークンを challenge に結び付けたコードを発行する。 */
export async function createHandoffCode(
  db: Db,
  input: { sessionToken: string; challenge: string },
  now: Date = new Date(),
): Promise<string> {
  const code = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  await db.insert(verification).values({
    id: crypto.randomUUID(),
    identifier: PREFIX + code,
    value: JSON.stringify(input),
    expiresAt: new Date(now.getTime() + TTL_MS),
  });
  return code;
}

/**
 * コードをセッショントークンに交換する。失敗（未知・期限切れ・verifier 不一致）は null。
 * 成否に関わらずコードは消費する（総当たり・再利用をさせない）。
 */
export async function redeemHandoffCode(
  db: Db,
  input: { code: string; verifier: string },
  now: Date = new Date(),
): Promise<string | null> {
  // DELETE ... RETURNING で「取り出しと消費」を1文にする（同時交換でも1回しか成功しない）。
  const [row] = await db
    .delete(verification)
    .where(eq(verification.identifier, PREFIX + input.code))
    .returning({
      value: verification.value,
      expiresAt: verification.expiresAt,
    });
  if (!row || row.expiresAt.getTime() <= now.getTime()) return null;
  const { sessionToken, challenge } = JSON.parse(row.value) as {
    sessionToken: string;
    challenge: string;
  };
  return (await challengeOf(input.verifier)) === challenge
    ? sessionToken
    : null;
}
