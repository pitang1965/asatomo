import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { account } from '../db/schema';
import { getUserEmail } from '../notify/resolver';
import type { EmailSender } from '../notify/senders';

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google',
  facebook: 'Facebook',
  line: 'LINE',
};

/**
 * 既存アカウントへ新しいログイン方法が「紐付け」られた直後に、本人の登録済みメールへ
 * 通知する（新規登録時は対象外）。src/lib/auth.ts の databaseHooks から呼ぶ。
 *
 * 背景: accountLinking（src/lib/auth.ts）はメール一致で自動的に既存アカウントへ統合するが、
 * LINE はメール未検証のまま trustedProviders に含めている（コメント参照）ため、
 * 攻撃者が一時的に被害者のメール受信箱へアクセスできれば（フィッシング等）、無断で
 * 既存アカウントに静かに紐付いてログインできてしまう。通知自体で乗っ取りを防げる
 * わけではないが、本人が気づいて対処できる最低限の安全網にする。
 *
 * ⚠ src/lib/auth.ts とは別ファイルにしている: auth.ts は `../db`（cloudflare:workers の
 *   ambient env）を静的importするため、Workers/Miniflare外（開発スクリプトのtsx実行等）から
 *   importできない。この関数自体はそれに依存しないので、分けることで
 *   scripts/dev-notify-link.ts から直接呼んで動作確認できる。
 */
export function notifyOnAdditionalLink(db: Db, email: EmailSender) {
  return async (created: { userId?: string; providerId?: string }) => {
    if (!created.userId || !created.providerId) return;
    try {
      const existing = await db
        .select({ id: account.id })
        .from(account)
        .where(eq(account.userId, created.userId));
      // 1件（今作られた分だけ）なら新規登録。2件以上あれば既存アカウントへの追加の紐付け。
      if (existing.length <= 1) return;
      const to = await getUserEmail(db, created.userId);
      if (!to) return;
      const label = PROVIDER_LABELS[created.providerId] ?? created.providerId;
      await email.send(to, {
        subject: '[アサトモ] 新しいログイン方法が追加されました',
        text: `あなたのアサトモアカウントに、${label}でのログインが新しく追加されました。\n覚えがない場合は、至急アカウントの見守り設定をご確認ください。`,
      });
    } catch (e) {
      // 通知の失敗でログイン自体は壊さないが、Workersのログ/Sentryには残す
      console.error('account-link notify failed', e);
    }
  };
}
