/**
 * 低レベルの送信チャネル（Sender）。実体は fetch でAPIを叩くが、テスト・差し替えのため
 * インターフェースに分離する。宛先解決や文面組み立ては上位（notifier.ts）の責務。
 *
 * LINE Messaging API は、見守り者の LINE userId（Bot友だち関係）をまだスキーマに持たないため
 * MVP では見送り、見守り者通知はメールで行う。将来 line_user_id を持たせて LineSender を足す。
 */

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushSender {
  sendToTokens(tokens: string[], msg: PushMessage): Promise<void>;
}

export interface EmailMessage {
  subject: string;
  text: string;
}

export interface EmailSender {
  send(to: string, msg: EmailMessage): Promise<void>;
}

// ─── FCM HTTP v1 ────────────────────────────────────────────────────────────
export interface FcmConfig {
  projectId: string;
  /** サービスアカウントから OAuth アクセストークンを得る関数（トークン発行はこの層の外）。 */
  getAccessToken: () => Promise<string>;
  fetchImpl?: typeof fetch;
}

export function createFcmPushSender(config: FcmConfig): PushSender {
  const doFetch = config.fetchImpl ?? fetch;
  const url = `https://fcm.googleapis.com/v1/projects/${config.projectId}/messages:send`;
  return {
    async sendToTokens(tokens, msg) {
      if (tokens.length === 0) return;
      const accessToken = await config.getAccessToken();
      await Promise.all(
        tokens.map(async (token) => {
          const res = await doFetch(url, {
            method: 'POST',
            headers: {
              authorization: `Bearer ${accessToken}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              message: {
                token,
                notification: { title: msg.title, body: msg.body },
                ...(msg.data ? { data: msg.data } : {}),
              },
            }),
          });
          if (!res.ok) throw new Error(`FCM send failed: ${res.status}`);
        }),
      );
    },
  };
}

// ─── メール（Resend 互換の REST。Cloudflare Workers 向き） ────────────────────
export interface EmailConfig {
  apiKey: string;
  from: string;
  /** 既定は Resend。互換APIに差し替え可。 */
  endpoint?: string;
  fetchImpl?: typeof fetch;
}

export function createHttpEmailSender(config: EmailConfig): EmailSender {
  const doFetch = config.fetchImpl ?? fetch;
  const endpoint = config.endpoint ?? 'https://api.resend.com/emails';
  return {
    async send(to, msg) {
      const res = await doFetch(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: config.from,
          to,
          subject: msg.subject,
          text: msg.text,
        }),
      });
      if (!res.ok) throw new Error(`Email send failed: ${res.status}`);
    },
  };
}
