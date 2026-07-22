import { createHttpEmailSender } from '../src/notify/senders';
import { loadEnv } from './dev-db';

/**
 * 通知メール（Resend）配線のワンショット確認。
 * デプロイ前に「本物が届くか」だけを最短で検証する（DB もサーバーも通さない）。
 *
 * 実行:
 *   EMAIL_API_KEY=re_xxx npx tsx scripts/dev-send-test.ts you@example.com
 *   （または .env に EMAIL_API_KEY / EMAIL_FROM を置いて）
 *   npx tsx scripts/dev-send-test.ts you@example.com
 *
 * ⚠ ドメイン未検証の Resend では、宛先はアカウント所有者のメールに限られる。
 *    over40web.club を検証すれば任意の相手へ送れる。
 *    .env.local に一時的に置いた場合はコミットしないこと（.env.local は .gitignore 済み）。
 */

// EMAIL_API_KEY / EMAIL_FROM は .env.local から（シェル指定があればそちらが優先）。
loadEnv();

async function main() {
  const to = process.argv[2];
  if (!to) {
    throw new Error(
      '宛先を渡してください: npx tsx scripts/dev-send-test.ts you@example.com',
    );
  }
  const apiKey = process.env.EMAIL_API_KEY;
  const from = process.env.EMAIL_FROM ?? 'no-reply@over40web.club';
  if (!apiKey) {
    throw new Error(
      'EMAIL_API_KEY がありません（環境変数か .env で渡してください）',
    );
  }

  const sender = createHttpEmailSender({ apiKey, from: `アサトモ <${from}>` });
  await sender.send(to, {
    subject: '[アサトモ] 通知テスト',
    text: [
      'これは Resend 配線のテスト送信です。',
      'このメールが届いていれば、本番の見守り通知（エスカレーション・開示）が',
      '実際に相手へ届く状態になっています。',
    ].join('\n'),
  });
  console.log(`送信しました: アサトモ <${from}> → ${to}`);
}

main().then(() => process.exit(0));
