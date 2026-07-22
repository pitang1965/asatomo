import { and, count, eq, isNull, ne } from 'drizzle-orm';
import type { Db } from '../db';
import {
  connections,
  deathCertifications,
  deathVotes,
  subjectSettings,
  user,
} from '../db/schema';
import { getAcceptedWatcherEmails, getUserName } from '../notify/resolver';
import { leaveWatch } from './connections';
import {
  countLivingWatchers,
  type DomainConfig,
  isWatcherLiving,
  withdrawVote,
} from './monitoring';

/**
 * アカウント削除（[[アカウント削除]]。ADR-0007）。
 *
 * 削除は「設定の一機能」ではなく安全イベント。あるユーザーは2つの役割で他人と結ばれる
 * （connections の有向エッジ。subjectUserId=本人 / otherUserId=誰かの見守り者・受取人）。
 * ゆえに削除は「本人として持つ側の全撤去」＋「見守り者を務める全エッジの一括見守り解除」。
 *
 * 方針（ADR-0007）:
 *   - 即時・不可逆・ハード削除（ソフト削除なし）。
 *   - 見守り者側は一括 leaveWatch として畳み、網が縮む本人へ非対称通知（沈黙より通知）。
 *   - 自分を見守る人へは「利用をやめた」穏当通知（死亡認定/開示と別物）。
 *   - 進行中認定: 自分宛は消滅（cascade。通知文で「安否確認は解除」を添える）／
 *     他者宛の自分の票は明示 withdraw（cascade 任せだと定足数の再計算が走らないため）。
 *   - user 行を消すと cascade で全関連（session/account/connections/signals/messages/
 *     votes/attestations/subjectSettings…）が消える。
 *
 * 通知は「純粋ドメインは通知しない」慣習に従い、削除前に宛先を確定して結果で返す。
 * ルート層（handlers）が返り値を見て Notifier を叩く。自分の見守り者のメールは削除で
 * connections が消えるため、ここで捕捉して返す（削除後は再解決できない）。
 */

// ─── 削除プレビュー（確認画面の材料。読み取り専用・無変更） ───────────────────
export interface WatchedSubjectImpact {
  subjectUserId: string;
  /** その本人の名前（あなたが見ている相手）。 */
  subjectName: string;
  /** いまの生存見守り者数（あなたを含む）。 */
  currentLivingWatchers: number;
  /** あなたが抜けた後の生存見守り者数。 */
  resultingLivingWatchers: number;
  /** あなたが抜けると見守り者が0人になる。 */
  leavesEmpty: boolean;
  /** あなたが抜けると開示ライン（生存2人）を割る。 */
  dropsBelowDisclosureLine: boolean;
}

export interface AccountDeletionPreview {
  /** あなたが accepted 見守り者を務める本人ごとの、抜けた後の影響。 */
  watchedSubjects: WatchedSubjectImpact[];
  /** あなたを見守ってくれている人の数（「利用をやめた」通知が届く相手）。 */
  watchersOnYou: number;
}

/**
 * 削除で起きることを、変更せずに集計する（ADR-0007 §2 の「情報つきの摩擦」）。
 * watchedSubjects は危険度の高い順（0人 → ライン割れ → その他）に並べる。
 */
export async function previewAccountDeletion(
  db: Db,
  userId: string,
  config: DomainConfig,
): Promise<AccountDeletionPreview> {
  const now = config.now ?? new Date();

  // あなたが accepted 見守り者であるエッジ（相手＝本人）と、その本人名・あなたの鮮度。
  const watched = await db
    .select({
      subjectUserId: connections.subjectUserId,
      subjectName: user.name,
      myLastSeenAt: connections.watcherLastSeenAt,
    })
    .from(connections)
    .innerJoin(user, eq(connections.subjectUserId, user.id))
    .where(
      and(
        eq(connections.otherUserId, userId),
        eq(connections.isWatcher, true),
        eq(connections.watcherStatus, 'accepted'),
      ),
    );

  const watchedSubjects: WatchedSubjectImpact[] = [];
  for (const w of watched) {
    const currentLiving = await countLivingWatchers(
      db,
      w.subjectUserId,
      now,
      config,
    );
    const iAmLiving = isWatcherLiving(w.myLastSeenAt, now, config);
    const resulting = currentLiving - (iAmLiving ? 1 : 0);
    watchedSubjects.push({
      subjectUserId: w.subjectUserId,
      subjectName: w.subjectName,
      currentLivingWatchers: currentLiving,
      resultingLivingWatchers: resulting,
      leavesEmpty: resulting === 0,
      dropsBelowDisclosureLine: currentLiving >= 2 && resulting < 2,
    });
  }

  // 危険度の高い順（空 → ライン割れ → 残数昇順）に並べる。
  watchedSubjects.sort((a, b) => {
    if (a.leavesEmpty !== b.leavesEmpty) return a.leavesEmpty ? -1 : 1;
    if (a.dropsBelowDisclosureLine !== b.dropsBelowDisclosureLine)
      return a.dropsBelowDisclosureLine ? -1 : 1;
    return a.resultingLivingWatchers - b.resultingLivingWatchers;
  });

  const [watchersRow] = await db
    .select({ n: count() })
    .from(connections)
    .where(
      and(
        eq(connections.subjectUserId, userId),
        eq(connections.isWatcher, true),
        eq(connections.watcherStatus, 'accepted'),
      ),
    );

  return { watchedSubjects, watchersOnYou: watchersRow?.n ?? 0 };
}

// ─── 削除の実行（2段: plan＝読み取り / finalize＝変更）。ADR-0007 ─────────────
export interface WatcherLeftNotice {
  subjectUserId: string;
  /** 本人があなたに付けている表示名。 */
  watcherName: string;
  /** あなたが抜けて開示ラインを割るか（文面を強める）。 */
  disclosureLocked: boolean;
}

export interface AccountDeletionPlan {
  /** あなたの名前（自分の見守り者への通知文面用）。 */
  yourName: string;
  /** あなたを見守ってくれている人のメール（削除で connections が消える前に捕捉）。 */
  watcherEmailsOnYou: string[];
  /** あなた自身に対する死亡認定が進行中か（通知に「安否確認は解除」を添える）。 */
  hadActiveAlertOnYou: boolean;
  /** 網が縮む本人ごとの通知意図（ルート層が notifySubjectWatcherLeft を叩く）。 */
  subjectsToNotify: WatcherLeftNotice[];
}

/**
 * 削除で発火すべき通知の意図を、**変更せずに**集計する（読み取り専用）。
 *
 * ルート層はこれを finalize の**前**に発火する。理由（ADR-0007 §2「沈黙より通知」）:
 * 明示トランザクションを張らない方針のため、撤去の途中で失敗しても本人の網が黙って
 * 縮まないよう、不可逆な削除より先に通知を出す（再実行での重複通知は沈黙より許容）。
 */
export async function planAccountDeletion(
  db: Db,
  userId: string,
  config: DomainConfig,
): Promise<AccountDeletionPlan> {
  const now = config.now ?? new Date();

  const yourName = (await getUserName(db, userId)) ?? 'あなた';
  const watcherEmailsOnYou = await getAcceptedWatcherEmails(db, userId);

  // 自分に対する進行中の死亡認定があるか（通知文の分岐用）。
  const [ownCert] = await db
    .select({ id: deathCertifications.id })
    .from(deathCertifications)
    .where(
      and(
        eq(deathCertifications.subjectUserId, userId),
        eq(deathCertifications.outcome, 'in_progress'),
      ),
    )
    .limit(1);
  const [ownState] = await db
    .select({ state: subjectSettings.state })
    .from(subjectSettings)
    .where(eq(subjectSettings.userId, userId))
    .limit(1);
  const hadActiveAlertOnYou =
    ownCert !== undefined || (ownState != null && ownState.state !== 'normal');

  // あなたが accepted 見守り者であるエッジ（相手＝本人）と、その表示名・あなたの鮮度。
  // disclosureLocked は「あなたが抜けた後の生存見守り者 < 2」を投影する（leaveWatch と同義）。
  const watched = await db
    .select({
      subjectUserId: connections.subjectUserId,
      watcherName: connections.displayName,
      myLastSeenAt: connections.watcherLastSeenAt,
    })
    .from(connections)
    .where(
      and(
        eq(connections.otherUserId, userId),
        eq(connections.isWatcher, true),
        eq(connections.watcherStatus, 'accepted'),
      ),
    );
  const subjectsToNotify: WatcherLeftNotice[] = [];
  for (const w of watched) {
    const currentLiving = await countLivingWatchers(
      db,
      w.subjectUserId,
      now,
      config,
    );
    const iAmLiving = isWatcherLiving(w.myLastSeenAt, now, config);
    const resulting = currentLiving - (iAmLiving ? 1 : 0);
    subjectsToNotify.push({
      subjectUserId: w.subjectUserId,
      watcherName: w.watcherName,
      disclosureLocked: resulting < 2,
    });
  }

  return {
    yourName,
    watcherEmailsOnYou,
    hadActiveAlertOnYou,
    subjectsToNotify,
  };
}

/**
 * アカウントを実際に撤去する（変更あり・ハード削除）。ルート層が planAccountDeletion の
 * 通知を発火した**後**に呼ぶ。
 *
 * 手順:
 *   1. 自分に対する進行中の死亡認定を本人取消でキャンセル（ADR-0007 §5a。削除操作＝生存の証拠）。
 *      行は user 削除で cascade 消えるが、部分失敗の窓で cron が去りゆく本人を
 *      エスカレーションし続けないよう明示的に閉じる。アラート済み見守り者への「解除」は
 *      departure 通知（hadActiveAlert 分岐）が担う。
 *   2. 他者の進行中認定に投じた自分の票を明示取り下げ → 定足数を再計算（cascade 任せにしない。§5b）。
 *   3. あなたが見守る各本人を一括で見守り解除（開示可否を再計算。§1）。
 *   4. user 行を削除 → cascade で全関連が消える（ハード削除。§Q5）。
 *
 * 注: 既存コード同様、明示トランザクションは張らない。安全の要（通知）は plan 側で先に済むため、
 * ここでの部分失敗は「本人の網が黙って縮む」不変条件を破らない（再実行で収束）。
 */
export async function finalizeAccountDeletion(
  db: Db,
  userId: string,
  config: DomainConfig,
): Promise<void> {
  const now = config.now ?? new Date();

  // 1. 自分に対する進行中の認定を本人取消でキャンセル（§5a）＋監視状態を通常へ戻す。
  await db
    .update(deathCertifications)
    .set({
      outcome: 'cancelled_by_subject',
      cancelReason: 'account_deleted',
      cancelledAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(deathCertifications.subjectUserId, userId),
        eq(deathCertifications.outcome, 'in_progress'),
      ),
    );
  await db
    .update(subjectSettings)
    .set({ state: 'normal', stateChangedAt: now, updatedAt: now })
    .where(
      and(
        eq(subjectSettings.userId, userId),
        ne(subjectSettings.state, 'normal'),
      ),
    );

  // 2. 他者の進行中認定に投じた自分の票を明示取り下げ → 定足数を再計算（§5b）。
  const votedSubjects = await db
    .selectDistinct({ subjectUserId: deathCertifications.subjectUserId })
    .from(deathVotes)
    .innerJoin(
      deathCertifications,
      eq(deathVotes.certificationId, deathCertifications.id),
    )
    .where(
      and(
        eq(deathVotes.voterUserId, userId),
        isNull(deathVotes.withdrawnAt),
        eq(deathCertifications.outcome, 'in_progress'),
      ),
    );
  for (const v of votedSubjects) {
    if (v.subjectUserId === userId) continue; // 自分宛は 1 で処理済み。
    await withdrawVote(
      db,
      { subjectUserId: v.subjectUserId, voterUserId: userId },
      config,
    );
  }

  // 3. あなたが見守る各本人を一括で見守り解除（開示可否を再計算。§1）。
  const watchedSubjects = await db
    .select({ subjectUserId: connections.subjectUserId })
    .from(connections)
    .where(
      and(
        eq(connections.otherUserId, userId),
        eq(connections.isWatcher, true),
        eq(connections.watcherStatus, 'accepted'),
      ),
    );
  for (const s of watchedSubjects) {
    await leaveWatch(
      db,
      { watcherUserId: userId, subjectUserId: s.subjectUserId },
      config,
    );
  }

  // 4. user 行を削除 → cascade で全関連が消える（ハード削除。§Q5）。
  await db.delete(user).where(eq(user.id, userId));
}
