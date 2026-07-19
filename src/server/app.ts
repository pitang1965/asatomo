import { createHandlers } from '../api/handlers';
import { createDb } from '../db';
import { DEFAULT_DOMAIN_CONFIG } from '../domain/monitoring';
import { createAuth } from '../lib/auth';
import { createNotifications } from '../notify/notifier';
import {
  createMailerSendEmailSender,
  type EmailSender,
  type PushSender,
} from '../notify/senders';
import type { ServerEnv } from './env';

/**
 * リクエストごとのアプリ組み立て（Workers ではバインディングがリクエスト内でのみ有効）。
 * DB・認証・通知・ハンドラをここで束ね、サーバールートは createRequestApp(env) を呼ぶだけにする。
 */

/** 環境変数の不足など、リクエスト側の問題ではない設定ミス。ルート層で 503 に写す。 */
export class ConfigError extends Error {}

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
  if (!env.DATABASE_URL)
    throw new ConfigError(
      'DATABASE_URL が未設定です。.env（開発）または Workers のシークレット（本番）に設定してください。',
    );

  const db = createDb(env.DATABASE_URL);
  const auth = createAuth(env);

  const email =
    env.EMAIL_API_KEY && env.EMAIL_FROM
      ? createMailerSendEmailSender({
          apiKey: env.EMAIL_API_KEY,
          from: env.EMAIL_FROM,
          fromName: 'アサトモ',
        })
      : devEmail;

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
