import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db';
import * as schema from '../src/db/schema';
import { notifyOnAdditionalLink } from '../src/lib/account-link-notify';
import type { EmailMessage, EmailSender } from '../src/notify/senders';
import { makeTestDb, seedUser } from './helpers';

let db: Db;
beforeEach(async () => {
  db = await makeTestDb();
});

function mockEmail() {
  const calls: { to: string; msg: EmailMessage }[] = [];
  const email: EmailSender = {
    async send(to, msg) {
      calls.push({ to, msg });
    },
  };
  return { email, calls };
}

async function addAccount(userId: string, providerId: string) {
  const id = `${userId}-${providerId}`;
  await db
    .insert(schema.account)
    .values({ id, userId, providerId, accountId: id });
}

describe('notifyOnAdditionalLink', () => {
  it('最初の1本目（新規登録）では通知しない', async () => {
    const userId = await seedUser(db);
    await addAccount(userId, 'google');
    const { email, calls } = mockEmail();

    await notifyOnAdditionalLink(db, email)({ userId, providerId: 'google' });

    expect(calls).toHaveLength(0);
  });

  it('2本目（既存アカウントへの追加の紐付け）で本人のメールへ通知する', async () => {
    const userId = await seedUser(db);
    await addAccount(userId, 'google');
    await addAccount(userId, 'line');
    const { email, calls } = mockEmail();

    await notifyOnAdditionalLink(db, email)({ userId, providerId: 'line' });

    expect(calls).toHaveLength(1);
    const [u] = await db
      .select({ email: schema.user.email })
      .from(schema.user)
      .where(eq(schema.user.id, userId));
    expect(calls[0].to).toBe(u.email);
    expect(calls[0].msg.text).toContain('LINE');
  });

  it('userId/providerId が無ければ何もしない', async () => {
    const { email, calls } = mockEmail();

    await notifyOnAdditionalLink(db, email)({});

    expect(calls).toHaveLength(0);
  });
});
