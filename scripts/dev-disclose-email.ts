import { eq } from 'drizzle-orm';
import { createDb } from '../src/db';
import { connections } from '../src/db/schema';
import { createNotifications } from '../src/notify/notifier';
import { createHttpEmailSender, type PushSender } from '../src/notify/senders';
import { loadEnv } from './dev-db';

/**
 * 開発用: 実際の開示メール（discloseMessages）を1通、自分の受信箱へ送って中身を確認する。
 *   前提: 先に `npx tsx scripts/dev-disclose.ts` を実行して開示テスト一式を仕込んでおくこと。
 *   本スクリプトは、その受取人つながりの externalEmail を **引数の実アドレス** に差し替え、
 *   本番と同じ discloseMessages を1回呼ぶ（件名・本文・/disclosure リンク・受取人ごとの集約を確認）。
 *
 * 実行: npx tsx scripts/dev-disclose-email.ts あなた@example.com
 * 参照は .env.local（EMAIL_API_KEY / EMAIL_FROM / DATABASE_URL）。over40web.club は検証済みなので
 * 任意の宛先に送れる。リンクは WEB_BASE_URL（未設定なら BETTER_AUTH_URL）由来＝dev では 127.0.0.1:5173。
 */
loadEnv();

// dev-disclose.ts と一致させる（同じ本人・つながり・エピソードを使う）。
const SUBJECT_ID = 'seed-subject-disclose';
const CONNECTION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccc01';
const CERT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeee001';

// discloseMessages はメールしか使わないが型上 push が要る（no-op）。
const noopPush: PushSender = {
  async sendToTokens() {},
};

async function main() {
  const to = process.argv[2];
  if (!to)
    throw new Error(
      '宛先を渡してください: npx tsx scripts/dev-disclose-email.ts あなた@example.com',
    );

  const { DATABASE_URL, EMAIL_API_KEY, EMAIL_FROM } = process.env;
  if (!DATABASE_URL) throw new Error('DATABASE_URL がありません（.env.local）');
  if (!EMAIL_API_KEY || !EMAIL_FROM)
    throw new Error(
      'EMAIL_API_KEY / EMAIL_FROM がありません（.env.local）。実送信できません。',
    );

  const db = createDb(DATABASE_URL);

  // 受取人つながりの宛先を実アドレスへ差し替え（dev-disclose.ts で仕込んだ行）。
  const updated = await db
    .update(connections)
    .set({ externalEmail: to })
    .where(eq(connections.id, CONNECTION_ID))
    .returning({ id: connections.id });
  if (updated.length === 0)
    throw new Error(
      '開示テストのつながりが見つかりません。先に `npx tsx scripts/dev-disclose.ts` を実行してください。',
    );

  const notify = createNotifications(
    db,
    {
      push: noopPush,
      email: createHttpEmailSender({
        apiKey: EMAIL_API_KEY,
        from: `アサトモ <${EMAIL_FROM}>`,
      }),
    },
    {
      appName: 'アサトモ',
      webBaseUrl:
        process.env.WEB_BASE_URL ||
        process.env.BETTER_AUTH_URL ||
        'http://127.0.0.1:5173',
      operatorEmail: process.env.OPERATOR_EMAIL ?? '',
    },
  );

  await notify.discloseMessages(SUBJECT_ID, CERT_ID);
  console.log(`開示メールを送信しました → ${to}`);
  console.log('  件名: [アサトモ] 佐藤 健太（開示テスト）さんからの伝言');
  console.log(
    `  リンク先: /disclosure/${CONNECTION_ID}（合言葉「ポチ」で開く）`,
  );
}

main().then(() => process.exit(0));
