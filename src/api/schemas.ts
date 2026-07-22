import { z } from 'zod';
import type { Handlers } from './handlers';

/**
 * エンドポイントごとの入力スキーマ。router 前段で検証し、JSON の文字列日付を Date へ変換する
 * （ハンドラは Date を期待するため、この coerce が正しさに直結する）。
 * キーは Handlers と一致必須（型で網羅を保証）。
 */

const signalKind = z.enum([
  'alarm_dismiss',
  'meal',
  'sleep',
  'app_open',
  'device_unlock',
  'web_checkin',
  'outing',
  'homecoming',
]);

const recipient = z.object({
  connectionId: z.string().min(1),
  wrappedDek: z.string().min(1),
});

const encrypted = {
  encryptedLabel: z.string(),
  ciphertext: z.string(),
  iv: z.string(),
  cipherAlgo: z.string().optional(),
  authorWrappedDek: z.string(),
};

const id = z.string().min(1);

export const SCHEMAS: Record<keyof Handlers, z.ZodType> = {
  signal: z.object({
    kind: signalKind,
    occurredAt: z.coerce.date().optional(),
    source: z.enum(['app', 'web']).optional(),
  }),
  setTravel: z.object({ until: z.coerce.date() }),
  clearTravel: z.object({}),
  appLogout: z.object({}),
  cancelDisclosure: z.object({}),
  watchOverview: z.object({}),
  vote: z.object({ subjectUserId: id }),
  withdrawVote: z.object({ subjectUserId: id }),
  attest: z.object({ subjectUserId: id, note: z.string().optional() }),
  respondToInvite: z.object({ subjectUserId: id, accept: z.boolean() }),
  raiseConcern: z.object({ subjectUserId: id, note: z.string().optional() }),
  inviteWatcher: z.object({
    watcherUserId: id,
    displayName: z.string().optional(),
  }),
  revokeWatcher: z.object({ connectionId: id }),
  leaveWatch: z.object({ subjectUserId: id }),
  createInvitation: z.object({}),
  acceptInvitation: z.object({ token: id, mutual: z.boolean() }),
  revokeInvitation: z.object({ token: id }),
  addContact: z.object({
    displayName: z.string().min(1),
    email: z.string().optional(),
    userId: z.string().optional(),
    passphraseHint: z.string().optional(),
  }),
  setPassphraseHint: z.object({
    connectionId: id,
    hint: z.string().nullable(),
  }),
  createMessage: z.object({ ...encrypted, recipients: z.array(recipient) }),
  updateMessage: z.object({
    messageId: id,
    encryptedLabel: z.string().optional(),
    ciphertext: z.string().optional(),
    iv: z.string().optional(),
    cipherAlgo: z.string().optional(),
    authorWrappedDek: z.string().optional(),
  }),
  setRecipients: z.object({ messageId: id, recipients: z.array(recipient) }),
  deleteMessage: z.object({ messageId: id }),
  listMessages: z.object({}),
  deleteAccount: z.object({}),
};
