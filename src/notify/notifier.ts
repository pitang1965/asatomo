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
  // title はプッシュのタイトル兼メール件名（tag で [アサトモ] を前置）。appName を渡さない
  // （件名が「[アサトモ] アサトモ」になるため、意味のある一言を渡す）。
  //
  // body はプッシュ本文（短く。通知シェードで切られる）。email で文面を上書きできる:
  //   - text: メール用の本文。プッシュと違い「なぜ届いたか」「放置するとどうなるか」まで
  //     書ける（メールは受信箱で埋もれるので、文脈を思い出せないと動けない）。
  //   - link: メール本文にのみ付けるURL（プッシュはタップで開くのでURL不要・ノイズになる）。
  // 経路の呼び分けもここで効く: プッシュが届く相手はアプリ所持者、メールが飛ぶ相手は
  // トークンが無い＝アプリ非所持（iPhone の本人等）。チャネルごとに実在する経路だけ案内する
  // のは CONTEXT.md「経路非依存」（iPhone の本人に「アプリを開いて」と言わない）の趣旨に沿う。
  async function notifySubject(
    subjectUserId: string,
    title: string,
    body: string,
    email?: { text?: string; link?: string },
  ): Promise<void> {
    const tokens = await getSubjectPushTokens(db, subjectUserId);
    if (tokens.length > 0) {
      await senders.push.sendToTokens(tokens, { title, body });
      return;
    }
    const to = await getUserEmail(db, subjectUserId);
    if (to) {
      const base = email?.text ?? body;
      const text = email?.link ? `${base}\n\n${email.link}` : base;
      await senders.email.send(to, { subject: tag(title), text });
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
      // 件名＝「元気ですか？」。本文はチャネルで分ける（CONTEXT.md プラットフォームの呼び分け）:
      //   - プッシュ（アプリ所持者）: タップすれば開くので一言だけ。
      //   - メール（アプリ非所持の本人）: 開く先を「アサトモWeb」と名指しする。ユーザーが実際に
      //     目にする名はヘッダー／ログインの「アサトモWeb」であり、加えて受信者は見守られる側の
      //     本人なので「見守りWeb」では役割とも噛み合わない。理由（しばらく応答が無い）と帰結
      //     （見守り者へ連絡が行く）も添える。無視した先のコストが相手に及ぶことが、この段階で
      //     最も効く行動喚起。URL は env WEB_BASE_URL 由来（`/` はログイン済みなら /me へ）。
      await notifySubject(
        subjectUserId,
        '元気ですか？',
        'アプリを開くだけで大丈夫です。',
        {
          text: [
            'しばらく応答が確認できていません。',
            'アサトモWebを開くだけで大丈夫です。それだけで「元気」が届きます。',
            'このまま応答がないと、見守ってくださっている方へご連絡します。',
          ].join('\n'),
          link: config.webBaseUrl,
        },
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
      // 受取人（connection）ごとに1通へ集約（ADR-0011 §3）。同じ人へ複数の伝言があっても、
      // メールは1通・リンクは /disclosure/{connectionId} 一つ（合言葉1回で全て開ける）。
      // email/hint は受取人ごとに一意なので、その connection の先頭行から取れば足りる。
      const byConnection = new Map<string, (typeof payloads)[number]>();
      for (const p of payloads) {
        if (!byConnection.has(p.connectionId))
          byConnection.set(p.connectionId, p);
      }
      await Promise.all(
        [...byConnection.values()].map(async (p) => {
          const to =
            p.recipientEmail ??
            (p.recipientUserId
              ? await getUserEmail(db, p.recipientUserId)
              : null);
          if (!to) return;
          const link = `${config.webBaseUrl}/disclosure/${p.connectionId}`;
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
