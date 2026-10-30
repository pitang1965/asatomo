import { createHandlers } from '../api/handlers';
import { ConfigError, createDb } from '../db';
import { DEFAULT_DOMAIN_CONFIG } from '../domain/monitoring';
import { createAuth } from '../lib/auth';
import { createNotifications } from '../notify/notifier';
import {
  createHttpEmailSender,
  type EmailSender,
  type PushSender,
} from '../notify/senders';
import type { ServerEnv } from './env';

/**
 * リクエストごとのアプリ組み立て（Workers ではバインディングがリクエスト内でのみ有効）。
 * DB・認証・通知・ハンドラをここで束ね、サーバールートは createRequestApp(env) を呼ぶだけにする。
 */

export { ConfigError };

// FCM はサービスアカウント署名（getAccessToken）の実装後に createFcmPushSender へ差し替える。
const devPush: PushSender = {
  async sendToTokens(tokens, msg) {
    console.info(`[dev:push] ${tokens.length}台へ「${msg.title}」`);
  },
};

const devEmail: EmailSender = {
  async send(to, msg) {
    console.info(`[dev:email] ${to} 宛「${msg.subject}」\n${msg.text}`);
  },
};

export function createRequestApp(env: ServerEnv) {
  const db = createDb();

  const email =
    env.EMAIL_API_KEY && env.EMAIL_FROM
      ? createHttpEmailSender({
          apiKey: env.EMAIL_API_KEY,
          // Resend は from に表示名を含められる（受信者には「アサトモ」名義で届く）。
          from: `アサトモ <${env.EMAIL_FROM}>`,
        })
      : devEmail;

  // auth のアカウント紐付け通知（src/lib/auth.ts）にも同じ送信チャネルを渡す。
  const auth = createAuth(env, db, email);

  const notify = createNotifications(
    db,
    { push: devPush, email },
    {
      appName: 'アサトモ',
      webBaseUrl: env.WEB_BASE_URL || env.BETTER_AUTH_URL,
      operatorEmail: env.OPERATOR_EMAIL,
    },
  );

  const handlers = createHandlers({
    db,
    notify,
    config: DEFAULT_DOMAIN_CONFIG,
  });

  return { db, auth, handlers, notify };
}
