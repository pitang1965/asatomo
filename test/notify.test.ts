import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db';
import * as schema from '../src/db/schema';
import { addContact } from '../src/domain/connections';
import { createMessage } from '../src/domain/messages';
import { DEFAULT_DOMAIN_CONFIG } from '../src/domain/monitoring';
import { createNotifications } from '../src/notify/notifier';
import {
  createFcmPushSender,
  createHttpEmailSender,
  type EmailMessage,
  type EmailSender,
  type PushMessage,
  type PushSender,
} from '../src/notify/senders';
import { makeTestDb, seedSubject, seedWatcher } from './helpers';

const NOW = new Date('2026-07-14T12:00:00Z');
const cfg = { ...DEFAULT_DOMAIN_CONFIG, now: NOW };
const notifyCfg = {
  appName: 'アサトモ',
  webBaseUrl: 'https://asatomo.nafuda.me',
  operatorEmail: 'ops@asatomo.test',
};

let db: Db;
beforeEach(async () => {
  db = await makeTestDb();
});

function mockSenders() {
  const pushCalls: { tokens: string[]; msg: PushMessage }[] = [];
  const emailCalls: { to: string; msg: EmailMessage }[] = [];
  const push: PushSender = {
    async sendToTokens(tokens, msg) {
      pushCalls.push({ tokens, msg });
    },
  };
  const email: EmailSender = {
    async send(to, msg) {
      emailCalls.push({ to, msg });
    },
  };
  return { senders: { push, email }, pushCalls, emailCalls };
}

async function addPushToken(userId: string, token: string) {
  await db.insert(schema.pushTokens).values({ userId, fcmToken: token });
}

describe('宛先解決＋通知（Notifications）', () => {
  it('未応答: プッシュトークンがあればプッシュ', async () => {
    const s = await seedSubject(db);
    await addPushToken(s, 'tok-1');
    const { senders, pushCalls, emailCalls } = mockSenders();
    await createNotifications(db, senders, notifyCfg).notifySubjectUnresponsive(
      s,
    );
    expect(pushCalls).toHaveLength(1);
    expect(pushCalls[0]?.tokens).toEqual(['tok-1']);
    expect(emailCalls).toHaveLength(0);
  });

  it('未応答: トークンが無ければ本人メールにフォールバック', async () => {
    const s = await seedSubject(db);
    const { senders, pushCalls, emailCalls } = mockSenders();
    await createNotifications(db, senders, notifyCfg).notifySubjectUnresponsive(
      s,
    );
    expect(pushCalls).toHaveLength(0);
    expect(emailCalls).toHaveLength(1);
  });

  it('見守り者アラート: 承諾済みだけにメール', async () => {
    const s = await seedSubject(db);
    const w1 = await seedWatcher(db, s); // accepted
    const w2 = await seedWatcher(db, s); // accepted
    await seedWatcher(db, s, { accepted: false }); // pending → 除外
    const { senders, emailCalls } = mockSenders();
    await createNotifications(db, senders, notifyCfg).notifyWatchersAlert(s);
    expect(emailCalls).toHaveLength(2);
    const to = emailCalls.map((c) => c.to).sort();
    expect(to).toEqual([`${w1}@example.test`, `${w2}@example.test`].sort());
  });

  it('開示: 受取人メールへ、リンクと合言葉ヒント付き', async () => {
    const s = await seedSubject(db);
    const contact = await addContact(
      db,
      {
        subjectUserId: s,
        email: 'mother@example.test',
        displayName: '母',
        passphraseHint: '犬の名前',
      },
      cfg,
    );
    if (!contact.ok) throw new Error('setup');
    const msg = await createMessage(
      db,
      {
        subjectUserId: s,
        encryptedLabel: 'bA==',
        ciphertext: 'Yw==',
        iv: 'aXY=',
        authorWrappedDek: 'YXdk',
        recipients: [
          { connectionId: contact.connectionId, wrappedDek: 'ZGVr' },
        ],
      },
      cfg,
    );
    if (!msg.ok) throw new Error('setup');

    const { senders, emailCalls } = mockSenders();
    await createNotifications(db, senders, notifyCfg).discloseMessages(
      s,
      'cert-1',
    );
    expect(emailCalls).toHaveLength(1);
    expect(emailCalls[0]?.to).toBe('mother@example.test');
    expect(emailCalls[0]?.msg.text).toContain(
      `${notifyCfg.webBaseUrl}/message/${msg.messageId}/${contact.connectionId}`,
    );
    expect(emailCalls[0]?.msg.text).toContain('犬の名前');
  });

  it('運営者劣化通知: 運営者メールへ', async () => {
    const { senders, emailCalls } = mockSenders();
    await createNotifications(db, senders, notifyCfg).notifyOperatorDegraded(
      new Error('db down'),
    );
    expect(emailCalls).toHaveLength(1);
    expect(emailCalls[0]?.to).toBe('ops@asatomo.test');
    expect(emailCalls[0]?.msg.text).toContain('db down');
  });

  it('見守り者への懸念通知は文面が状況を反映', async () => {
    const s = await seedSubject(db);
    await seedWatcher(db, s);
    const { senders, emailCalls } = mockSenders();
    await createNotifications(db, senders, notifyCfg).notifyWatchers(
      s,
      'concern',
    );
    expect(emailCalls).toHaveLength(1);
    expect(emailCalls[0]?.msg.text).toContain('連絡が取れない');
  });

  it('開示ロック通知: 本人へ「2人必要」', async () => {
    const s = await seedSubject(db);
    await addPushToken(s, 'tok');
    const { senders, pushCalls } = mockSenders();
    await createNotifications(
      db,
      senders,
      notifyCfg,
    ).notifySubjectDisclosureLocked(s);
    expect(pushCalls[0]?.msg.body).toContain('2人');
  });
});

describe('送信チャネルのリクエスト組み立て', () => {
  it('FCM: HTTP v1 のエンドポイントとペイロード', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    const sender = createFcmPushSender({
      projectId: 'proj-x',
      getAccessToken: async () => 'access-tok',
      fetchImpl,
    });
    await sender.sendToTokens(['t1'], { title: 'T', body: 'B' });

    expect(calls[0]?.url).toBe(
      'https://fcm.googleapis.com/v1/projects/proj-x/messages:send',
    );
    const body = JSON.parse(calls[0]?.init.body as string);
    expect(body.message.token).toBe('t1');
    expect(body.message.notification).toEqual({ title: 'T', body: 'B' });
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer access-tok');
  });

  it('メール: Resend 互換の POST', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    const sender = createHttpEmailSender({
      apiKey: 'key',
      from: 'no-reply@asatomo.test',
      fetchImpl,
    });
    await sender.send('to@example.test', { subject: 'S', text: 'X' });

    expect(calls[0]?.url).toBe('https://api.resend.com/emails');
    const body = JSON.parse(calls[0]?.init.body as string);
    expect(body).toMatchObject({
      from: 'no-reply@asatomo.test',
      to: 'to@example.test',
      subject: 'S',
      text: 'X',
    });
  });

  it('FCM: 非2xx は例外', async () => {
    const fetchImpl = (async () =>
      new Response('err', { status: 500 })) as unknown as typeof fetch;
    const sender = createFcmPushSender({
      projectId: 'p',
      getAccessToken: async () => 't',
      fetchImpl,
    });
    await expect(
      sender.sendToTokens(['t1'], { title: 'a', body: 'b' }),
    ).rejects.toThrow(/FCM/);
  });
});
