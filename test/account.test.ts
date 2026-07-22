import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db';
import * as schema from '../src/db/schema';
import {
  finalizeAccountDeletion,
  planAccountDeletion,
  previewAccountDeletion,
} from '../src/domain/account';
import { DEFAULT_DOMAIN_CONFIG } from '../src/domain/monitoring';
import {
  makeTestDb,
  seedCertification,
  seedSubject,
  seedUser,
} from './helpers';

/**
 * アカウント削除（ADR-0007）。安全の核: 一括見守り解除の非対称通知・開示ライン再計算・
 * 進行中認定の扱い・他者認定の票取り下げ・ハード削除の cascade を検証する。
 */

const NOW = new Date('2026-07-14T12:00:00Z');
const cfg = { ...DEFAULT_DOMAIN_CONFIG, now: NOW };

let db: Db;
beforeEach(async () => {
  db = await makeTestDb();
});

/** 「watcher が subject を見守る」エッジ（subject 所有・otherUserId=watcher）を作る。 */
async function watch(
  subjectUserId: string,
  watcherUserId: string,
  opts: { lastSeenAt?: Date | null; displayName?: string } = {},
) {
  await db.insert(schema.connections).values({
    subjectUserId,
    otherUserId: watcherUserId,
    displayName: opts.displayName ?? `見守り-${watcherUserId}`,
    isWatcher: true,
    watcherStatus: 'accepted',
    watcherLastSeenAt: opts.lastSeenAt === undefined ? NOW : opts.lastSeenAt,
  });
}

async function connOf(subjectUserId: string, otherUserId: string) {
  const [r] = await db
    .select()
    .from(schema.connections)
    .where(
      and(
        eq(schema.connections.subjectUserId, subjectUserId),
        eq(schema.connections.otherUserId, otherUserId),
      ),
    )
    .limit(1);
  return r;
}

async function stateOf(subjectUserId: string) {
  const [r] = await db
    .select({ state: schema.subjectSettings.state })
    .from(schema.subjectSettings)
    .where(eq(schema.subjectSettings.userId, subjectUserId))
    .limit(1);
  return r?.state;
}

describe('削除プレビュー（変更なしの集計）', () => {
  it('唯一の見守り者は0人・2人目は開示ライン割れ、危険度順に並ぶ', async () => {
    const alice = await seedUser(db, 'alice');
    const solo = await seedSubject(db); // alice のみが見守る
    await watch(solo, alice);
    const pair = await seedSubject(db); // alice + もう1人
    const other = await seedUser(db, 'other');
    await watch(pair, alice);
    await watch(pair, other);

    const preview = await previewAccountDeletion(db, alice, cfg);
    expect(preview.watchedSubjects).toHaveLength(2);

    // 危険度順: 空(solo) → ライン割れ(pair)。
    const [first, second] = preview.watchedSubjects;
    expect(first).toMatchObject({
      subjectUserId: solo,
      currentLivingWatchers: 1,
      resultingLivingWatchers: 0,
      leavesEmpty: true,
      dropsBelowDisclosureLine: false,
    });
    expect(second).toMatchObject({
      subjectUserId: pair,
      currentLivingWatchers: 2,
      resultingLivingWatchers: 1,
      leavesEmpty: false,
      dropsBelowDisclosureLine: true,
    });
  });

  it('自分を見守ってくれている人数を返す（利用終了通知の宛先数）', async () => {
    const me = await seedSubject(db);
    await seedUserWatches(me); // 2人が me を見守る
    await seedUserWatches(me);
    const preview = await previewAccountDeletion(db, me, cfg);
    expect(preview.watchersOnYou).toBe(2);
  });
});

/** 新規 user を作って subject を見守らせ、その watcher id を返す。 */
async function seedUserWatches(subjectUserId: string): Promise<string> {
  const w = await seedUser(db, 'w');
  await watch(subjectUserId, w);
  return w;
}

describe('削除の実行: 一括見守り解除と非対称通知', () => {
  it('網が縮む本人ごとに通知意図を返し、開示可否を再計算する', async () => {
    const alice = await seedUser(db, 'alice');
    const solo = await seedSubject(db);
    await watch(solo, alice, { displayName: 'アリス' });
    const pair = await seedSubject(db);
    const other = await seedUser(db, 'other');
    await watch(pair, alice, { displayName: 'アリスさん' });
    await watch(pair, other);

    // plan（読み取り専用）が通知意図を返す。まだ何も変更しない。
    const plan = await planAccountDeletion(db, alice, cfg);

    expect(plan.subjectsToNotify).toHaveLength(2);
    const soloNotice = plan.subjectsToNotify.find(
      (s) => s.subjectUserId === solo,
    );
    const pairNotice = plan.subjectsToNotify.find(
      (s) => s.subjectUserId === pair,
    );
    // 本人が付けた表示名で名指し。どちらも開示ライン未満へ落ちる。
    expect(soloNotice).toMatchObject({
      watcherName: 'アリス',
      disclosureLocked: true,
    });
    expect(pairNotice).toMatchObject({
      watcherName: 'アリスさん',
      disclosureLocked: true,
    });
    // plan は無変更: エッジはまだ accepted のまま（通知は不可逆削除の前に済ませる）。
    expect((await connOf(solo, alice))?.watcherStatus).toBe('accepted');

    // finalize で実際に撤去。alice のエッジは cascade で消える（ハード削除）。
    await finalizeAccountDeletion(db, alice, cfg);
    expect(await connOf(solo, alice)).toBeUndefined();
    // pair は残り1人（other）に。
    expect((await connOf(pair, other))?.watcherStatus).toBe('accepted');
  });

  it('自分を見守っていた人のメールを削除前に捕捉して返す', async () => {
    const me = await seedSubject(db);
    const w = await seedUser(db, 'watcheronme');
    await watch(me, w);

    const plan = await planAccountDeletion(db, me, cfg);
    expect(plan.watcherEmailsOnYou).toEqual([`${w}@example.test`]);
  });
});

describe('削除の実行: 進行中の死亡認定', () => {
  it('自分に対する認定が進行中なら hadActiveAlertOnYou=true', async () => {
    const me = await seedSubject(db, { state: 'watchers_alerted' });
    await seedCertification(db, me, { stage: 'watchers_alerted' });

    const plan = await planAccountDeletion(db, me, cfg);
    expect(plan.hadActiveAlertOnYou).toBe(true);

    // finalize は §5a の本人取消を通しても壊れず、認定ごと cascade で消える。
    await finalizeAccountDeletion(db, me, cfg);
    const certs = await db
      .select()
      .from(schema.deathCertifications)
      .where(eq(schema.deathCertifications.subjectUserId, me));
    expect(certs).toHaveLength(0);
    expect(await stateOf(me)).toBeUndefined();
  });

  it('進行中認定が無ければ hadActiveAlertOnYou=false', async () => {
    const me = await seedSubject(db);
    const plan = await planAccountDeletion(db, me, cfg);
    expect(plan.hadActiveAlertOnYou).toBe(false);
  });

  it('他者の認定に投じた自分の票を取り下げ、定足数割れで voting→watchers_alerted へ戻す', async () => {
    const carol = await seedSubject(db, { state: 'voting' });
    const cid = await seedCertification(db, carol, { stage: 'voting' });
    const dave = await seedUser(db, 'dave');
    await watch(carol, dave); // dave は carol の見守り者
    await db
      .insert(schema.deathVotes)
      .values({ certificationId: cid, voterUserId: dave });

    await finalizeAccountDeletion(db, dave, cfg);

    // 単独票の取り下げで定足数割れ → 状態が戻る（cascade 任せでは起きない再計算）。
    expect(await stateOf(carol)).toBe('watchers_alerted');
  });
});

describe('削除の実行: ハード削除の cascade', () => {
  it('本人側の最後のメッセージ・宛先・シグナル・設定・user が消える', async () => {
    const erin = await seedSubject(db);
    const rcpt = await seedUser(db, 'rcpt');
    const [conn] = await db
      .insert(schema.connections)
      .values({
        subjectUserId: erin,
        otherUserId: rcpt,
        displayName: '受取人',
        isWatcher: false,
      })
      .returning({ id: schema.connections.id });
    const [msg] = await db
      .insert(schema.legacyMessages)
      .values({
        subjectUserId: erin,
        encryptedLabel: 'x',
        ciphertext: 'x',
        iv: 'x',
        authorWrappedDek: 'x',
      })
      .returning({ id: schema.legacyMessages.id });
    await db.insert(schema.messageRecipients).values({
      messageId: msg.id,
      connectionId: conn.id,
      wrappedDek: 'x',
    });
    await db.insert(schema.signals).values({
      subjectUserId: erin,
      kind: 'meal',
      occurredAt: NOW,
    });

    await finalizeAccountDeletion(db, erin, cfg);

    const messages = await db
      .select()
      .from(schema.legacyMessages)
      .where(eq(schema.legacyMessages.subjectUserId, erin));
    const recipients = await db
      .select()
      .from(schema.messageRecipients)
      .where(eq(schema.messageRecipients.messageId, msg.id));
    const sigs = await db
      .select()
      .from(schema.signals)
      .where(eq(schema.signals.subjectUserId, erin));

    expect(messages).toHaveLength(0);
    expect(recipients).toHaveLength(0);
    expect(sigs).toHaveLength(0);
    expect(await stateOf(erin)).toBeUndefined();
    const [u] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, erin))
      .limit(1);
    expect(u).toBeUndefined();
  });
});
