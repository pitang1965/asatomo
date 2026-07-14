import { and, eq } from 'drizzle-orm';
import type { Db } from '../db';
import { connections, pushTokens, user } from '../db/schema';

/** 通知の「宛先解決」— 誰に・どのチャネルで届けるかを DB から引く（pglite でテスト可能）。 */

export async function getSubjectPushTokens(
  db: Db,
  subjectUserId: string,
): Promise<string[]> {
  const rows = await db
    .select({ token: pushTokens.fcmToken })
    .from(pushTokens)
    .where(eq(pushTokens.userId, subjectUserId));
  return rows.map((r) => r.token);
}

export async function getUserEmail(
  db: Db,
  userId: string,
): Promise<string | null> {
  const [u] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return u?.email ?? null;
}

export async function getUserName(
  db: Db,
  userId: string,
): Promise<string | null> {
  const [u] = await db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return u?.name ?? null;
}

/** 承諾済み見守り者のメール（休眠は問わず全員へ。異常時通知なので広めに届ける）。 */
export async function getAcceptedWatcherEmails(
  db: Db,
  subjectUserId: string,
): Promise<string[]> {
  const rows = await db
    .select({ email: user.email })
    .from(connections)
    .innerJoin(user, eq(connections.otherUserId, user.id))
    .where(
      and(
        eq(connections.subjectUserId, subjectUserId),
        eq(connections.isWatcher, true),
        eq(connections.watcherStatus, 'accepted'),
      ),
    );
  return rows.map((r) => r.email);
}
