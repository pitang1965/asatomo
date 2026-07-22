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

/**
 * プレーンテキストを、言語を明示した最小 HTML に包む。
 * Gmail 等は HTML の lang 属性で言語を判定するため、日本語メールが「英語で書かれている
 * ようです」と誤検知されて翻訳バナーが出るのを防ぐ（本文はテキストと同一。改行は <br>）。
 */
export function toJapaneseHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<!doctype html><html lang="ja"><body>${escaped.replace(/\r?\n/g, '<br>')}</body></html>`;
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
          // 言語を明示（テキストと同内容の HTML）。翻訳バナーの誤検知を防ぐ。
          html: toJapaneseHtml(msg.text),
          headers: { 'Content-Language': 'ja' },
        }),
      });
      if (!res.ok) throw new Error(`Email send failed: ${res.status}`);
    },
  };
}

// ─── メール（MailerSend REST。Cloudflare Workers 向き） ───────────────────────
// 予備の sender。現状の本番は Resend（createHttpEmailSender）を採用（MailerSend Free は
// APIトークンを発行できないため）。MailerSend を Starter 以上にするなら再配線して使える。
// いずれも over40web.club 検証済みドメインから自前で直接送る（ADR-0003: なふだ非依存）。
export interface MailerSendConfig {
  apiKey: string;
  /** 検証済みドメイン上の送信元アドレス（例: no-reply@over40web.club）。 */
  from: string;
  /** 差出人の表示名（例: アサトモ）。省略可。 */
  fromName?: string;
  /** 既定は MailerSend。互換APIに差し替え可。 */
  endpoint?: string;
  fetchImpl?: typeof fetch;
}

export function createMailerSendEmailSender(
  config: MailerSendConfig,
): EmailSender {
  const doFetch = config.fetchImpl ?? fetch;
  const endpoint = config.endpoint ?? 'https://api.mailersend.com/v1/email';
  return {
    async send(to, msg) {
      // MailerSend は from をオブジェクト・to を配列で受ける（Resend の平坦形と異なる）。
      // 成功は 202 Accepted（res.ok に含まれる）。text のみで可。
      const res = await doFetch(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          from: {
            email: config.from,
            ...(config.fromName ? { name: config.fromName } : {}),
          },
          to: [{ email: to }],
          subject: msg.subject,
          text: msg.text,
          html: toJapaneseHtml(msg.text), // 言語明示で翻訳バナーの誤検知を防ぐ。
        }),
      });
      if (!res.ok) throw new Error(`MailerSend send failed: ${res.status}`);
    },
  };
}
