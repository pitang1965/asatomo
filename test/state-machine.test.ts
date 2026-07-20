import { desc, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { type Notifier, runMonitoringTick } from '../src/cron/monitoring-tick';
import type { Db } from '../src/db';
import * as schema from '../src/db/schema';
import {
  attest,
  cancelBySubject,
  castVote,
  DEFAULT_DOMAIN_CONFIG,
  recomputeDisclosureEnabled,
  recordSignal,
  withdrawVote,
} from '../src/domain/monitoring';
import {
  hoursAgo,
  makeTestDb,
  seedCertification,
  seedSubject,
  seedUser,
  seedWatcher,
} from './helpers';

const NOW = new Date('2026-07-14T12:00:00Z');
const cfg = { ...DEFAULT_DOMAIN_CONFIG, now: NOW };
const cronCfg = { stage1to2DelayHours: 12, batchLimit: 50, now: NOW };

let db: Db;
beforeEach(async () => {
  db = await makeTestDb();
});

async function stateOf(subjectId: string) {
  const [r] = await db
    .select({
      state: schema.subjectSettings.state,
      lastSignalAt: schema.subjectSettings.lastSignalAt,
      disclosureEnabled: schema.subjectSettings.disclosureEnabled,
    })
    .from(schema.subjectSettings)
    .where(eq(schema.subjectSettings.userId, subjectId))
    .limit(1);
  return r;
}

async function latestCert(subjectId: string) {
  const [r] = await db
    .select()
    .from(schema.deathCertifications)
    .where(eq(schema.deathCertifications.subjectUserId, subjectId))
    .orderBy(desc(schema.deathCertifications.createdAt))
    .limit(1);
  return r;
}

function mockNotifier() {
  const calls = {
    unresponsive: [] as string[],
    watchersAlert: [] as string[],
    disclose: [] as { id: string; cid: string }[],
    degraded: [] as unknown[],
  };
  const notifier: Notifier = {
    async notifySubjectUnresponsive(id) {
      calls.unresponsive.push(id);
    },
    async notifyWatchersAlert(id) {
      calls.watchersAlert.push(id);
    },
    async discloseMessages(id, cid) {
      calls.disclose.push({ id, cid });
    },
    async notifyOperatorDegraded(e) {
      calls.degraded.push(e);
    },
  };
  return { calls, notifier };
}

// ─── 不変条件A: 本人シグナルは全てを覆す ────────────────────────────────────
describe('不変条件A: 生存シグナル', () => {
  it('進行中エピソードを即キャンセルし normal へ戻す', async () => {
    const s = await seedSubject(db, { state: 'voting' });
    await seedCertification(db, s, { stage: 'voting' });

    const r = await recordSignal(db, { subjectUserId: s, kind: 'meal' }, cfg);

    expect(r.cancelledEpisode).toBe(true);
    expect((await stateOf(s))?.state).toBe('normal');
    expect((await latestCert(s))?.outcome).toBe('cancelled_by_signal');
  });

  it('last_signal_at は前進のみ（古いオフライン分で巻き戻らない）', async () => {
    const s = await seedSubject(db, {
      state: 'normal',
      lastSignalAt: NOW,
    });
    await recordSignal(
      db,
      { subjectUserId: s, kind: 'app_open', occurredAt: hoursAgo(5, NOW) },
      cfg,
    );
    expect((await stateOf(s))?.lastSignalAt?.getTime()).toBe(NOW.getTime());
  });

  it('disclosed からでも監視を再開する（開示は取消不能だが本人は生きている）', async () => {
    const s = await seedSubject(db, { state: 'disclosed' });
    const r = await recordSignal(db, { subjectUserId: s, kind: 'meal' }, cfg);
    expect(r.resumedFromDisclosed).toBe(true);
    expect((await stateOf(s))?.state).toBe('normal');
  });

  // ADR-0001 精緻化（2026-07-18）: 覆しの基準は occurredAt。端末の稼働 ≠ 本人の生存。
  it('検知窓外の遅延シグナルは投票中エピソードを覆さない（記録と時計前進のみ）', async () => {
    const s = await seedSubject(db, {
      state: 'voting',
      detectionWindowHours: 30,
    });
    await seedCertification(db, s, { stage: 'voting' });

    const occurredAt = hoursAgo(72, NOW);
    const r = await recordSignal(
      db,
      { subjectUserId: s, kind: 'alarm_dismiss', occurredAt },
      cfg,
    );

    expect(r.stale).toBe(true);
    expect(r.cancelledEpisode).toBe(false);
    const st = await stateOf(s);
    expect(st?.state).toBe('voting');
    expect(st?.lastSignalAt?.getTime()).toBe(occurredAt.getTime());
    expect((await latestCert(s))?.outcome).toBe('in_progress');
  });

  it('遅延しても検知窓内に戻るシグナルは覆す', async () => {
    const s = await seedSubject(db, {
      state: 'watchers_alerted',
      detectionWindowHours: 30,
    });
    await seedCertification(db, s, { stage: 'watchers_alerted' });

    const r = await recordSignal(
      db,
      {
        subjectUserId: s,
        kind: 'alarm_dismiss',
        occurredAt: hoursAgo(10, NOW),
      },
      cfg,
    );

    expect(r.stale).toBe(false);
    expect(r.cancelledEpisode).toBe(true);
    expect((await stateOf(s))?.state).toBe('normal');
    expect((await latestCert(s))?.outcome).toBe('cancelled_by_signal');
  });

  it('検知窓外の遅延シグナルは disclosed も復帰させない', async () => {
    const s = await seedSubject(db, { state: 'disclosed' });
    const r = await recordSignal(
      db,
      { subjectUserId: s, kind: 'app_open', occurredAt: hoursAgo(100, NOW) },
      cfg,
    );
    expect(r.stale).toBe(true);
    expect(r.resumedFromDisclosed).toBe(false);
    expect((await stateOf(s))?.state).toBe('disclosed');
  });

  it('未来の occurredAt は now へクランプされる（生存時計の先回り汚染防止）', async () => {
    const s = await seedSubject(db, { state: 'normal' });
    await recordSignal(
      db,
      {
        subjectUserId: s,
        kind: 'app_open',
        occurredAt: new Date(NOW.getTime() + 2 * 3_600_000),
      },
      cfg,
    );
    expect((await stateOf(s))?.lastSignalAt?.getTime()).toBe(NOW.getTime());
  });

  it('見守られている本人は subjectSettings が無くても初回シグナルで監視行を自動作成する', async () => {
    const u = await seedUser(db);
    await seedWatcher(db, u); // 承諾済み見守り者がいる＝正規の本人
    const r = await recordSignal(
      db,
      { subjectUserId: u, kind: 'app_open' },
      cfg,
    );
    expect(r.stale).toBe(false);
    const st = await stateOf(u);
    expect(st?.state).toBe('normal');
    expect(st?.lastSignalAt?.getTime()).toBe(NOW.getTime());
  });

  it('新種別 outing/homecoming を記録できる', async () => {
    const s = await seedSubject(db, { state: 'normal' });
    const r1 = await recordSignal(
      db,
      { subjectUserId: s, kind: 'outing' },
      cfg,
    );
    const r2 = await recordSignal(
      db,
      { subjectUserId: s, kind: 'homecoming' },
      cfg,
    );
    expect(r1.stale).toBe(false);
    expect(r2.stale).toBe(false);
    expect((await stateOf(s))?.lastSignalAt?.getTime()).toBe(NOW.getTime());
  });
});

// ─── 監視行の自動作成ゲート: 純粋な見守り者を監視対象にしない ────────────────
describe('監視行ゲート: 見守られていない人は本人化しない', () => {
  it('承諾済み見守り者がいない人のシグナルは no-op（行を作らない）', async () => {
    const w = await seedUser(db); // 誰にも見守られていない（純粋な見守り者/一般ユーザー）
    const r = await recordSignal(
      db,
      { subjectUserId: w, kind: 'web_checkin' },
      cfg,
    );
    expect(r).toEqual({
      cancelledEpisode: false,
      resumedFromDisclosed: false,
      stale: false,
    });
    expect(await stateOf(w)).toBeUndefined();
  });

  it('source は境界にならない（source=app の直接POSTでも作らない）', async () => {
    const w = await seedUser(db);
    await recordSignal(
      db,
      { subjectUserId: w, kind: 'meal', source: 'app' },
      cfg,
    );
    expect(await stateOf(w)).toBeUndefined();
  });

  it('承諾済み見守り者がいれば、行が無くてもシグナルで作成する（iPhone本人の初回）', async () => {
    const s = await seedUser(db);
    await seedWatcher(db, s); // s を見守る承諾済み見守り者を1人
    expect(await stateOf(s)).toBeUndefined(); // まだ監視行なし
    await recordSignal(db, { subjectUserId: s, kind: 'web_checkin' }, cfg);
    expect((await stateOf(s))?.state).toBe('normal'); // 作成された
  });
});

// ─── §4 クォーラム判定 ──────────────────────────────────────────────────────
describe('§4 クォーラム', () => {
  async function setupAlerted(
    watcherCount: number,
    opts: { floorPassed?: boolean; dormant?: number } = {},
  ) {
    const started =
      opts.floorPassed === false ? hoursAgo(1, NOW) : hoursAgo(48, NOW);
    const s = await seedSubject(db, { state: 'watchers_alerted' });
    await seedCertification(db, s, {
      stage: 'watchers_alerted',
      startedAt: started,
    });
    const dormant = opts.dormant ?? 0;
    const watchers: string[] = [];
    for (let i = 0; i < watcherCount; i += 1) {
      const isDormant = i < dormant;
      watchers.push(
        await seedWatcher(db, s, {
          lastSeenAt: isDormant ? hoursAgo(24 * 30, NOW) : NOW, // 30日前=休眠
        }),
      );
    }
    return { s, watchers };
  }

  it('2票以上 + 過半数 + 床経過 → certified_grace（3人中2票）', async () => {
    const { s, watchers } = await setupAlerted(3);
    await castVote(db, { subjectUserId: s, voterUserId: watchers[0] }, cfg);
    const r = await castVote(
      db,
      { subjectUserId: s, voterUserId: watchers[1] },
      cfg,
    );
    expect(r).toEqual({ ok: true, certified: true });
    expect((await stateOf(s))?.state).toBe('certified_grace');
    const cert = await latestCert(s);
    expect(cert?.stage).toBe('certified_grace');
    expect(cert?.graceUntil?.getTime()).toBe(NOW.getTime() + 48 * 3_600_000);
  });

  it('1票では成立しない', async () => {
    const { s, watchers } = await setupAlerted(3);
    const r = await castVote(
      db,
      { subjectUserId: s, voterUserId: watchers[0] },
      cfg,
    );
    expect(r).toEqual({ ok: true, certified: false });
    expect((await stateOf(s))?.state).toBe('voting');
  });

  it('過半数に満たなければ成立しない（5人中2票）', async () => {
    const { s, watchers } = await setupAlerted(5);
    await castVote(db, { subjectUserId: s, voterUserId: watchers[0] }, cfg);
    const r = await castVote(
      db,
      { subjectUserId: s, voterUserId: watchers[1] },
      cfg,
    );
    expect(r).toEqual({ ok: true, certified: false });
  });

  it('5人中3票なら成立', async () => {
    const { s, watchers } = await setupAlerted(5);
    await castVote(db, { subjectUserId: s, voterUserId: watchers[0] }, cfg);
    await castVote(db, { subjectUserId: s, voterUserId: watchers[1] }, cfg);
    const r = await castVote(
      db,
      { subjectUserId: s, voterUserId: watchers[2] },
      cfg,
    );
    expect(r).toEqual({ ok: true, certified: true });
  });

  it('床未経過なら成立しない', async () => {
    const { s, watchers } = await setupAlerted(3, { floorPassed: false });
    await castVote(db, { subjectUserId: s, voterUserId: watchers[0] }, cfg);
    const r = await castVote(
      db,
      { subjectUserId: s, voterUserId: watchers[1] },
      cfg,
    );
    expect(r).toEqual({ ok: true, certified: false });
  });

  it('休眠見守り者は分母から除外（4人中2休眠・2票で成立）', async () => {
    const { s, watchers } = await setupAlerted(4, { dormant: 2 });
    // 生存見守り者は2人。そのうち2票 → 2*2 > 2 で過半数成立。
    await castVote(db, { subjectUserId: s, voterUserId: watchers[2] }, cfg);
    const r = await castVote(
      db,
      { subjectUserId: s, voterUserId: watchers[3] },
      cfg,
    );
    expect(r).toEqual({ ok: true, certified: true });
  });

  it('見守り者でない者は投票できない', async () => {
    const { s } = await setupAlerted(2);
    const r = await castVote(
      db,
      { subjectUserId: s, voterUserId: 'stranger' },
      cfg,
    );
    expect(r).toEqual({ ok: false, reason: 'not_a_watcher' });
  });

  it('未承諾（pending）の見守り者は投票できない', async () => {
    const s = await seedSubject(db, { state: 'watchers_alerted' });
    await seedCertification(db, s, {
      stage: 'watchers_alerted',
      startedAt: hoursAgo(48, NOW),
    });
    const w = await seedWatcher(db, s, { accepted: false });
    const r = await castVote(db, { subjectUserId: s, voterUserId: w }, cfg);
    expect(r).toEqual({ ok: false, reason: 'not_a_watcher' });
  });
});

// ─── 不変条件B: 代理確認は覆さず知らせる ────────────────────────────────────
describe('不変条件B: 取り下げと代理確認', () => {
  async function setupVoting() {
    const s = await seedSubject(db, { state: 'watchers_alerted' });
    await seedCertification(db, s, {
      stage: 'watchers_alerted',
      startedAt: hoursAgo(48, NOW),
    });
    const w1 = await seedWatcher(db, s);
    const w2 = await seedWatcher(db, s);
    const w3 = await seedWatcher(db, s);
    return { s, w1, w2, w3 };
  }

  it('取り下げで有効票0 → voting を watchers_alerted へ戻す（normal へは飛ばさない）', async () => {
    // 1票（未成立=voting）から取り下げ、確実に certified を経ずに戻ることを検証。
    const { s, w1 } = await setupVoting();
    await castVote(db, { subjectUserId: s, voterUserId: w1 }, cfg);
    expect((await stateOf(s))?.state).toBe('voting');
    const r = await withdrawVote(
      db,
      { subjectUserId: s, voterUserId: w1 },
      cfg,
    );
    expect(r.activeVotes).toBe(0);
    expect((await stateOf(s))?.state).toBe('watchers_alerted');
  });

  it('代理確認: watchers_alerted かつ有効票0で解決（resolved_by_attestation・前進）', async () => {
    const { s, w1 } = await setupVoting();
    const r = await attest(
      db,
      { subjectUserId: s, attesterUserId: w1, note: 'さっき電話した' },
      cfg,
    );
    expect(r).toMatchObject({ ok: true, resolved: true, notifyWatchers: true });
    expect((await stateOf(s))?.state).toBe('normal');
    expect((await latestCert(s))?.outcome).toBe('resolved_by_attestation');
    expect((await stateOf(s))?.lastSignalAt?.getTime()).toBe(NOW.getTime());
  });

  it('代理確認: voting 中（有効票あり）は自動で解決しない', async () => {
    const { s, w1, w2 } = await setupVoting();
    await castVote(db, { subjectUserId: s, voterUserId: w1 }, cfg); // → voting
    const r = await attest(db, { subjectUserId: s, attesterUserId: w2 }, cfg);
    expect(r.resolved).toBe(false);
    expect((await stateOf(s))?.state).toBe('voting');
  });
});

// ─── 不変条件A': 本人のワンタップ取消 ───────────────────────────────────────
describe("不変条件A': 本人取消", () => {
  it('猶予中の取消 → normal / cancelled_by_subject', async () => {
    const s = await seedSubject(db, { state: 'certified_grace' });
    await seedCertification(db, s, { stage: 'certified_grace' });
    const r = await cancelBySubject(db, s, cfg);
    expect(r.ok).toBe(true);
    expect((await stateOf(s))?.state).toBe('normal');
    expect((await latestCert(s))?.outcome).toBe('cancelled_by_subject');
  });

  it('猶予中でなければ取消できない', async () => {
    const s = await seedSubject(db, { state: 'voting' });
    await seedCertification(db, s, { stage: 'voting' });
    const r = await cancelBySubject(db, s, cfg);
    expect(r).toEqual({ ok: false, reason: 'not_in_grace' });
  });
});

// ─── 不変条件D: 見守り者2人未満で開示ロック ─────────────────────────────────
describe('不変条件D: 開示ロック', () => {
  it('承諾済み1人なら無効', async () => {
    const s = await seedSubject(db);
    await seedWatcher(db, s);
    const r = await recomputeDisclosureEnabled(db, s, cfg);
    expect(r.enabled).toBe(false);
    expect((await stateOf(s))?.disclosureEnabled).toBe(false);
  });

  it('承諾済み2人（非休眠）なら有効', async () => {
    const s = await seedSubject(db);
    await seedWatcher(db, s);
    await seedWatcher(db, s);
    const r = await recomputeDisclosureEnabled(db, s, cfg);
    expect(r).toMatchObject({ enabled: true, livingWatchers: 2 });
  });

  it('2人でも1人休眠なら無効', async () => {
    const s = await seedSubject(db);
    await seedWatcher(db, s);
    await seedWatcher(db, s, { lastSeenAt: hoursAgo(24 * 30, NOW) });
    const r = await recomputeDisclosureEnabled(db, s, cfg);
    expect(r).toMatchObject({ enabled: false, livingWatchers: 1 });
  });
});

// ─── Cron: 時間駆動 T1/T2/T5 ────────────────────────────────────────────────
describe('Cron 監視tick', () => {
  it('T1: 判定窓超過で normal → unresponsive・エピソードopen・本人通知', async () => {
    const s = await seedSubject(db, {
      state: 'normal',
      lastSignalAt: hoursAgo(40, NOW), // 窓30h超過
    });
    const { calls, notifier } = mockNotifier();
    const res = await runMonitoringTick(db, notifier, cronCfg);
    expect(res.unresponsive).toBe(1);
    expect((await stateOf(s))?.state).toBe('unresponsive');
    expect((await latestCert(s))?.outcome).toBe('in_progress');
    expect(calls.unresponsive).toEqual([s]);
  });

  it('T1: 旅行モード中は検知しない', async () => {
    const s = await seedSubject(db, {
      state: 'normal',
      lastSignalAt: hoursAgo(40, NOW),
      travelUntil: new Date(NOW.getTime() + 24 * 3_600_000),
    });
    const { notifier } = mockNotifier();
    const res = await runMonitoringTick(db, notifier, cronCfg);
    expect(res.unresponsive).toBe(0);
    expect((await stateOf(s))?.state).toBe('normal');
  });

  it('T1: 一度もシグナルが無い本人は対象外', async () => {
    const s = await seedSubject(db, { state: 'normal', lastSignalAt: null });
    const { notifier } = mockNotifier();
    const res = await runMonitoringTick(db, notifier, cronCfg);
    expect(res.unresponsive).toBe(0);
    expect((await stateOf(s))?.state).toBe('normal');
  });

  it('T2: 段階1→2遅延超過で unresponsive → watchers_alerted・見守り者通知', async () => {
    const s = await seedSubject(db, {
      state: 'unresponsive',
      stateChangedAt: hoursAgo(13, NOW), // 遅延12h超過
    });
    await seedCertification(db, s, { stage: 'unresponsive' });
    const { calls, notifier } = mockNotifier();
    const res = await runMonitoringTick(db, notifier, cronCfg);
    expect(res.watchersAlerted).toBe(1);
    expect((await stateOf(s))?.state).toBe('watchers_alerted');
    expect(calls.watchersAlert).toEqual([s]);
  });

  it('T5: 猶予期限超過で certified_grace → disclosed・受取人通知', async () => {
    const s = await seedSubject(db, { state: 'certified_grace' });
    const [cert] = await db
      .insert(schema.deathCertifications)
      .values({
        subjectUserId: s,
        stage: 'certified_grace',
        graceUntil: hoursAgo(1, NOW), // 期限切れ
      })
      .returning({ id: schema.deathCertifications.id });
    const { calls, notifier } = mockNotifier();
    const res = await runMonitoringTick(db, notifier, cronCfg);
    expect(res.disclosed).toBe(1);
    expect((await stateOf(s))?.state).toBe('disclosed');
    expect((await latestCert(s))?.outcome).toBe('disclosed');
    expect(calls.disclose).toEqual([{ id: s, cid: cert.id }]);
  });
});
