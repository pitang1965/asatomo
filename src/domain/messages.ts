import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db';
import { connections, legacyMessages, messageRecipients } from '../db/schema';
import type { DomainConfig } from './monitoring';

/**
 * 最後の伝言のドメイン（作成・編集・宛先指定・開示解決）。ADR-0002。
 *
 * ゼロ知識: ドメイン層は暗号材料（暗号文・iv・ラップ済みDEK・暗号化見出し）を
 *   不透明なまま保存するだけ。暗号化/復号は端末側で行い、サーバは平文も鍵も持たない。
 *
 * 「受取人」は伝言の宛先（messageRecipients）から派生する動的状態。宛先は
 *   本人のつながりに限る（他人のつながりは指定できない）。
 * DEK は本人鍵（authorWrappedDek）＋受取人ごとの合言葉鍵（wrappedDek）にマルチラップ。
 */

export interface RecipientWrap {
  /** 宛先の受取人（= 本人のつながり）。 */
  connectionId: string;
  /** この受取人の合言葉由来鍵で包んだ DEK（base64）。 */
  wrappedDek: string;
}

export interface EncryptedContent {
  encryptedLabel: string; // base64
  ciphertext: string; // base64
  iv: string; // base64
  cipherAlgo?: string; // 既定 AES-GCM
  authorWrappedDek: string; // 本人鍵で包んだ DEK（生前の読み書き用）
}

// ─── 作成 ───────────────────────────────────────────────────────────────────
export async function createMessage(
  db: Db,
  input: { subjectUserId: string } & EncryptedContent & {
      recipients: RecipientWrap[];
    },
  config: DomainConfig,
): Promise<
  { ok: false; reason: 'invalid_recipient' } | { ok: true; messageId: string }
> {
  const now = config.now ?? new Date();
  const ids = input.recipients.map((r) => r.connectionId);
  if (!(await recipientsBelongTo(db, input.subjectUserId, ids)))
    return { ok: false, reason: 'invalid_recipient' };

  const [msg] = await db
    .insert(legacyMessages)
    .values({
      subjectUserId: input.subjectUserId,
      encryptedLabel: input.encryptedLabel,
      ciphertext: input.ciphertext,
      iv: input.iv,
      cipherAlgo: input.cipherAlgo ?? 'AES-GCM',
      authorWrappedDek: input.authorWrappedDek,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: legacyMessages.id });

  if (input.recipients.length > 0) {
    await db.insert(messageRecipients).values(
      input.recipients.map((r) => ({
        messageId: msg.id,
        connectionId: r.connectionId,
        wrappedDek: r.wrappedDek,
        createdAt: now,
      })),
    );
  }
  return { ok: true, messageId: msg.id };
}

// ─── 本文/見出しの編集（端末側で再暗号化した材料で差し替え） ──────────────────
export async function updateMessage(
  db: Db,
  input: {
    subjectUserId: string;
    messageId: string;
  } & Partial<EncryptedContent>,
  config: DomainConfig,
): Promise<{ ok: boolean; reason?: 'not_found' }> {
  const now = config.now ?? new Date();
  const upd = await db
    .update(legacyMessages)
    .set({
      updatedAt: now,
      ...(input.encryptedLabel !== undefined
        ? { encryptedLabel: input.encryptedLabel }
        : {}),
      ...(input.ciphertext !== undefined
        ? { ciphertext: input.ciphertext }
        : {}),
      ...(input.iv !== undefined ? { iv: input.iv } : {}),
      ...(input.cipherAlgo !== undefined
        ? { cipherAlgo: input.cipherAlgo }
        : {}),
      ...(input.authorWrappedDek !== undefined
        ? { authorWrappedDek: input.authorWrappedDek }
        : {}),
    })
    .where(
      and(
        eq(legacyMessages.id, input.messageId),
        eq(legacyMessages.subjectUserId, input.subjectUserId),
      ),
    )
    .returning({ id: legacyMessages.id });
  return upd.length > 0 ? { ok: true } : { ok: false, reason: 'not_found' };
}

// ─── 宛先指定の差し替え（個別/全員）。宛先変更は受取人ごとの再ラップを伴う ─────
export async function setMessageRecipients(
  db: Db,
  input: {
    subjectUserId: string;
    messageId: string;
    recipients: RecipientWrap[];
  },
  config: DomainConfig,
): Promise<{ ok: boolean; reason?: 'not_found' | 'invalid_recipient' }> {
  const now = config.now ?? new Date();
  const [msg] = await db
    .select({ id: legacyMessages.id })
    .from(legacyMessages)
    .where(
      and(
        eq(legacyMessages.id, input.messageId),
        eq(legacyMessages.subjectUserId, input.subjectUserId),
      ),
    )
    .limit(1);
  if (!msg) return { ok: false, reason: 'not_found' };

  const ids = input.recipients.map((r) => r.connectionId);
  if (!(await recipientsBelongTo(db, input.subjectUserId, ids)))
    return { ok: false, reason: 'invalid_recipient' };

  await db
    .delete(messageRecipients)
    .where(eq(messageRecipients.messageId, input.messageId));
  if (input.recipients.length > 0) {
    await db.insert(messageRecipients).values(
      input.recipients.map((r) => ({
        messageId: input.messageId,
        connectionId: r.connectionId,
        wrappedDek: r.wrappedDek,
        createdAt: now,
      })),
    );
  }
  return { ok: true };
}

// ─── 削除（cascade で宛先も消える） ─────────────────────────────────────────
export async function deleteMessage(
  db: Db,
  input: { subjectUserId: string; messageId: string },
): Promise<{ ok: boolean; reason?: 'not_found' }> {
  const del = await db
    .delete(legacyMessages)
    .where(
      and(
        eq(legacyMessages.id, input.messageId),
        eq(legacyMessages.subjectUserId, input.subjectUserId),
      ),
    )
    .returning({ id: legacyMessages.id });
  return del.length > 0 ? { ok: true } : { ok: false, reason: 'not_found' };
}

// ─── 本人の管理用一覧（暗号のまま返す。復号は端末側） ────────────────────────
export async function listMessages(db: Db, subjectUserId: string) {
  const msgs = await db
    .select()
    .from(legacyMessages)
    .where(eq(legacyMessages.subjectUserId, subjectUserId))
    .orderBy(desc(legacyMessages.createdAt));
  if (msgs.length === 0) return [];

  const rec = await db
    .select({
      messageId: messageRecipients.messageId,
      connectionId: messageRecipients.connectionId,
      wrappedDek: messageRecipients.wrappedDek,
    })
    .from(messageRecipients)
    .where(
      inArray(
        messageRecipients.messageId,
        msgs.map((m) => m.id),
      ),
    );

  return msgs.map((m) => {
    const mine = rec.filter((r) => r.messageId === m.id);
    return {
      ...m,
      recipientConnectionIds: mine.map((r) => r.connectionId),
      // 宛先の後から編集用: 既存宛先は wrappedDek を再利用する（合言葉の再入力を要求しない）。
      recipients: mine.map((r) => ({
        connectionId: r.connectionId,
        wrappedDek: r.wrappedDek,
      })),
    };
  });
}

// ─── 開示解決（T5）: 受取人ごとの配信ペイロードを集める ──────────────────────
//   通知層がこれを使って各受取人へ届ける（受取人は合言葉を入力して端末側で復号）。
export async function resolveDisclosure(db: Db, subjectUserId: string) {
  return db
    .select({
      messageId: legacyMessages.id,
      encryptedLabel: legacyMessages.encryptedLabel,
      ciphertext: legacyMessages.ciphertext,
      iv: legacyMessages.iv,
      cipherAlgo: legacyMessages.cipherAlgo,
      connectionId: messageRecipients.connectionId,
      wrappedDek: messageRecipients.wrappedDek,
      recipientEmail: connections.externalEmail,
      recipientUserId: connections.otherUserId,
      passphraseHint: connections.passphraseHint,
    })
    .from(messageRecipients)
    .innerJoin(
      legacyMessages,
      eq(messageRecipients.messageId, legacyMessages.id),
    )
    .innerJoin(connections, eq(messageRecipients.connectionId, connections.id))
    .where(eq(legacyMessages.subjectUserId, subjectUserId));
}

// ─── ヘルパ: 宛先がすべて本人のつながりか ───────────────────────────────────
async function recipientsBelongTo(
  db: Db,
  subjectUserId: string,
  connectionIds: string[],
): Promise<boolean> {
  const unique = [...new Set(connectionIds)];
  if (unique.length === 0) return true;
  const rows = await db
    .select({ id: connections.id })
    .from(connections)
    .where(
      and(
        eq(connections.subjectUserId, subjectUserId),
        inArray(connections.id, unique),
      ),
    );
  return rows.length === unique.length;
}
