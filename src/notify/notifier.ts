import type { Notifier } from '../cron/monitoring-tick';
import type { Db } from '../db';
import { resolveDisclosure } from '../domain/messages';
import {
  getAcceptedWatcherEmails,
  getSubjectPushTokens,
  getUserEmail,
  getUserName,
} from './resolver';
import type { EmailSender, PushSender } from './senders';

/**
 * 通知サービス。宛先解決（resolver）と送信（senders）を束ね、cron の Notifier と
 * ルート層が使う通知意図を満たす。文面（日本語）もここで組む。
 *
 * ルート層は、ドメイン関数が返す意図（attest の notifyWatchers=true 等）を見て
 * ここのメソッドを呼ぶ。cron は Notifier の4メソッドだけを使う。
 */

export interface NotifyConfig {
  appName: string;
  webBaseUrl: string;
  operatorEmail: string;
}

export type WatcherEvent = 'attestation' | 'concern' | 'vote_requested';

export interface Notifications extends Notifier {
  /** ルート層: 見守り者への各種お知らせ（代理確認/懸念/投票要請）。 */
  notifyWatchers(subjectUserId: string, event: WatcherEvent): Promise<void>;
  /** ルート層: 見守り者2人未満で開示がロックされたことを本人へ（不変条件D）。 */
  notifySubjectDisclosureLocked(subjectUserId: string): Promise<void>;
  /**
   * ルート層: 見守り者が自分から降りたことを本人へ（名指し・段階文面。CONTEXT 見守り解除）。
   * disclosureLocked=true なら開示ラインを割ったので文面を強める。
   */
  notifySubjectWatcherLeft(
    subjectUserId: string,
    watcherName: string,
    disclosureLocked: boolean,
  ): Promise<void>;
  /**
   * ルート層: あなたが[[アカウント削除]]で去ったことを、あなたを見守っていた人へ（ADR-0007）。
   * 死亡認定/開示とは別物の穏当な文面。宛先は削除前に捕捉したメール（connections は消えている）。
   * hadActiveAlert=true（削除時に安否確認が進行中だった）なら「安否確認は解除」を添える。
   */
  notifySubjectDeparted(
    departingName: string,
    watcherEmails: string[],
    hadActiveAlert: boolean,
  ): Promise<void>;
  /** ルート層: 見守り招待を受けた相手へ。 */
  notifyWatchInvite(
    subjectUserId: string,
    inviteeUserId: string,
  ): Promise<void>;
  /** ルート層: 招待リンクが承諾され、相手が見守りに加わったことを招待者へ（ADR-0005）。 */
  notifyInviteAccepted(
    inviterUserId: string,
    accepterUserId: string,
    mutual: boolean,
  ): Promise<void>;
}

export function createNotifications(
  db: Db,
  senders: { push: PushSender; email: EmailSender },
  config: NotifyConfig,
): Notifications {
  const tag = (s: string) => `[${config.appName}] ${s}`;

  // プッシュ優先・トークンが無ければメールにフォールバックして本人へ届ける。
  // linkForEmail はメール本文にのみ付ける（プッシュはタップで開くのでURL不要・ノイズになる）。
  // title はプッシュのタイトル兼メール件名（tag で [アサトモ] を前置）。appName を渡さない
  // （件名が「[アサトモ] アサトモ」になるため、意味のある一言を渡す）。
  async function notifySubject(
    subjectUserId: string,
    title: string,
    body: string,
    linkForEmail?: string,
  ): Promise<void> {
    const tokens = await getSubjectPushTokens(db, subjectUserId);
    if (tokens.length > 0) {
      await senders.push.sendToTokens(tokens, { title, body });
      return;
    }
    const email = await getUserEmail(db, subjectUserId);
    if (email) {
      const text = linkForEmail ? `${body}\n${linkForEmail}` : body;
      await senders.email.send(email, { subject: tag(title), text });
    }
  }

  async function emailWatchers(
    subjectUserId: string,
    subject: string,
    text: string,
  ): Promise<void> {
    const emails = await getAcceptedWatcherEmails(db, subjectUserId);
    await Promise.all(
      emails.map((e) => senders.email.send(e, { subject: tag(subject), text })),
    );
  }

  return {
    // ── cron Notifier ──
    async notifySubjectUnresponsive(subjectUserId) {
      // 件名＝「元気ですか？」／本文にスマホアプリと見守りWeb（経路非依存。CONTEXT.md
      // プラットフォームの呼び分け）。メールには見守りWebのURLを付ける（ドメインは env
      // WEB_BASE_URL 由来。iPhone等アプリ非所持の本人はここから開く）。
      await notifySubject(
        subjectUserId,
        '元気ですか？',
        'スマホアプリか見守りWebを開くだけで大丈夫です。',
        config.webBaseUrl,
      );
    },

    async notifyWatchersAlert(subjectUserId) {
      const name = (await getUserName(db, subjectUserId)) ?? '見守り相手';
      await emailWatchers(
        subjectUserId,
        `${name}さんの安否確認のお願い`,
        `${name}さんからしばらく応答がありません。連絡を取ってみてください。\n${config.webBaseUrl}`,
      );
    },

    async discloseMessages(subjectUserId, _certificationId) {
      const name = (await getUserName(db, subjectUserId)) ?? '大切な方';
      const payloads = await resolveDisclosure(db, subjectUserId);
      await Promise.all(
        payloads.map(async (p) => {
          const to =
            p.recipientEmail ??
            (p.recipientUserId
              ? await getUserEmail(db, p.recipientUserId)
              : null);
          if (!to) return;
          const link = `${config.webBaseUrl}/message/${p.messageId}/${p.connectionId}`;
          const hint = p.passphraseHint
            ? `\n合言葉のヒント: ${p.passphraseHint}`
            : '';
          await senders.email.send(to, {
            subject: tag(`${name}さんからの伝言`),
            text: `${name}さんが、あなたへ伝言を遺されました。\n下記から合言葉を入力して開いてください。\n${link}${hint}`,
          });
        }),
      );
    },

    async notifyOperatorDegraded(error) {
      await senders.email.send(config.operatorEmail, {
        subject: tag('監視tickが劣化しました'),
        text: `監視tickが DB 不通などで劣化しました。至急ご確認ください。\n${String(error)}`,
      });
    },

    // ── ルート層の通知意図 ──
    async notifyWatchers(subjectUserId, event) {
      const name = (await getUserName(db, subjectUserId)) ?? '見守り相手';
      const body =
        event === 'attestation'
          ? `${name}さんについて、別の見守り者が生存を確認しました。`
          : event === 'concern'
            ? `${name}さんについて「連絡が取れない」という報告がありました。確認してみてください。`
            : `${name}さんの死亡確認の投票が始まりました。ご確認ください。`;
      await emailWatchers(
        subjectUserId,
        'お知らせ',
        `${body}\n${config.webBaseUrl}`,
      );
    },

    async notifySubjectDisclosureLocked(subjectUserId) {
      await notifySubject(
        subjectUserId,
        '見守り者があと1人必要です',
        '最後の伝言の開示には見守り者が2人必要です。もう1人招待しましょう。',
      );
    },

    async notifySubjectWatcherLeft(
      subjectUserId,
      watcherName,
      disclosureLocked,
    ) {
      const body = disclosureLocked
        ? `${watcherName}さんが見守りをやめました。見守ってくれる人が少なくなり、今のままでは最後の伝言を届けられません。もう1人、見守りをお願いしましょう。`
        : `${watcherName}さんが見守りをやめました。`;
      await notifySubject(subjectUserId, '見守りのお知らせ', body);
    },

    async notifySubjectDeparted(departingName, watcherEmails, hadActiveAlert) {
      const body = hadActiveAlert
        ? `${departingName}さんはアサトモの利用をやめました。進行中だった安否確認は解除されました。ご心配なく。`
        : `${departingName}さんはアサトモの利用をやめました。これまで見守っていただき、ありがとうございました。`;
      await Promise.all(
        watcherEmails.map((e) =>
          senders.email.send(e, { subject: tag('お知らせ'), text: body }),
        ),
      );
    },

    async notifyWatchInvite(subjectUserId, inviteeUserId) {
      const name = (await getUserName(db, subjectUserId)) ?? '知り合い';
      const email = await getUserEmail(db, inviteeUserId);
      if (!email) return;
      await senders.email.send(email, {
        subject: tag('見守りのお願い'),
        text: `${name}さんが、あなたに見守りをお願いしています。\n${config.webBaseUrl}`,
      });
    },

    async notifyInviteAccepted(inviterUserId, accepterUserId, mutual) {
      const name = (await getUserName(db, accepterUserId)) ?? '相手';
      const body = mutual
        ? `${name}さんと見守り合いを始めました。`
        : `${name}さんがあなたの見守りに加わりました。`;
      await notifySubject(inviterUserId, '見守りのお知らせ', body);
    },
  };
}
