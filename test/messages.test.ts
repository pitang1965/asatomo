import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db';
import * as schema from '../src/db/schema';
import { addContact } from '../src/domain/connections';
import {
  createMessage,
  deleteMessage,
  listMessages,
  resolveDisclosure,
  resolveDisclosureForRecipient,
  setMessageRecipients,
  updateMessage,
} from '../src/domain/messages';
import { DEFAULT_DOMAIN_CONFIG } from '../src/domain/monitoring';
import { makeTestDb, seedCertification, seedSubject } from './helpers';

const NOW = new Date('2026-07-14T12:00:00Z');
const cfg = { ...DEFAULT_DOMAIN_CONFIG, now: NOW };

let db: Db;
beforeEach(async () => {
  db = await makeTestDb();
});

async function makeRecipient(
  subjectUserId: string,
  email: string,
  hint?: string,
): Promise<string> {
  const r = await addContact(
    db,
    { subjectUserId, email, displayName: email, passphraseHint: hint },
    cfg,
  );
  if (!r.ok) throw new Error('recipient setup failed');
  return r.connectionId;
}

const content = {
  encryptedLabel: 'bGFiZWw=',
  ciphertext: 'Y2lwaGVy',
  iv: 'aXY=',
  authorWrappedDek: 'YXV0aG9yREVL',
};

describe('メッセージの作成と宛先', () => {
  it('2受取人へのメッセージを作成できる', async () => {
    const s = await seedSubject(db);
    const c1 = await makeRecipient(s, 'a@example.test');
    const c2 = await makeRecipient(s, 'b@example.test');

    const res = await createMessage(
      db,
      {
        subjectUserId: s,
        ...content,
        recipients: [
          { connectionId: c1, wrappedDek: 'ZGVrMQ==' },
          { connectionId: c2, wrappedDek: 'ZGVrMg==' },
        ],
      },
      cfg,
    );
    expect(res.ok).toBe(true);

    const recs = await db
      .select()
      .from(schema.messageRecipients)
      .where(
        eq(schema.messageRecipients.messageId, res.ok ? res.messageId : ''),
      );
    expect(recs).toHaveLength(2);
  });

  it('本人のものでない宛先は拒否', async () => {
    const s = await seedSubject(db);
    const other = await seedSubject(db);
    const foreign = await makeRecipient(other, 'x@example.test');

    const res = await createMessage(
      db,
      {
        subjectUserId: s,
        ...content,
        recipients: [{ connectionId: foreign, wrappedDek: 'ZGVr' }],
      },
      cfg,
    );
    expect(res).toEqual({ ok: false, reason: 'invalid_recipient' });
  });

  it('宛先ゼロのメッセージも作成できる（後で宛先指定）', async () => {
    const s = await seedSubject(db);
    const res = await createMessage(
      db,
      { subjectUserId: s, ...content, recipients: [] },
      cfg,
    );
    expect(res.ok).toBe(true);
  });
});

describe('編集と削除（本人のみ）', () => {
  it('本文を差し替えられる', async () => {
    const s = await seedSubject(db);
    const created = await createMessage(
      db,
      { subjectUserId: s, ...content, recipients: [] },
      cfg,
    );
    if (!created.ok) throw new Error('setup');
    const upd = await updateMessage(
      db,
      { subjectUserId: s, messageId: created.messageId, ciphertext: 'bmV3' },
      cfg,
    );
    expect(upd.ok).toBe(true);
    const [row] = await db
      .select()
      .from(schema.legacyMessages)
      .where(eq(schema.legacyMessages.id, created.messageId));
    expect(row?.ciphertext).toBe('bmV3');
  });

  it('他人のメッセージは編集できない', async () => {
    const s = await seedSubject(db);
    const other = await seedSubject(db);
    const created = await createMessage(
      db,
      { subjectUserId: s, ...content, recipients: [] },
      cfg,
    );
    if (!created.ok) throw new Error('setup');
    const upd = await updateMessage(
      db,
      { subjectUserId: other, messageId: created.messageId, ciphertext: 'x' },
      cfg,
    );
    expect(upd).toEqual({ ok: false, reason: 'not_found' });
  });

  it('削除で宛先も消える（cascade）', async () => {
    const s = await seedSubject(db);
    const c1 = await makeRecipient(s, 'a@example.test');
    const created = await createMessage(
      db,
      {
        subjectUserId: s,
        ...content,
        recipients: [{ connectionId: c1, wrappedDek: 'ZGVr' }],
      },
      cfg,
    );
    if (!created.ok) throw new Error('setup');

    const del = await deleteMessage(db, {
      subjectUserId: s,
      messageId: created.messageId,
    });
    expect(del.ok).toBe(true);
    const recs = await db
      .select()
      .from(schema.messageRecipients)
      .where(eq(schema.messageRecipients.messageId, created.messageId));
    expect(recs).toHaveLength(0);
  });
});

describe('宛先の差し替え', () => {
  it('宛先を2→1に差し替えられる', async () => {
    const s = await seedSubject(db);
    const c1 = await makeRecipient(s, 'a@example.test');
    const c2 = await makeRecipient(s, 'b@example.test');
    const created = await createMessage(
      db,
      {
        subjectUserId: s,
        ...content,
        recipients: [
          { connectionId: c1, wrappedDek: 'ZDE=' },
          { connectionId: c2, wrappedDek: 'ZDI=' },
        ],
      },
      cfg,
    );
    if (!created.ok) throw new Error('setup');

    const res = await setMessageRecipients(
      db,
      {
        subjectUserId: s,
        messageId: created.messageId,
        recipients: [{ connectionId: c1, wrappedDek: 'ZDFuZXc=' }],
      },
      cfg,
    );
    expect(res.ok).toBe(true);
    const recs = await db
      .select()
      .from(schema.messageRecipients)
      .where(eq(schema.messageRecipients.messageId, created.messageId));
    expect(recs).toHaveLength(1);
    expect(recs[0]?.connectionId).toBe(c1);
  });
});

describe('開示解決（T5の配信ペイロード）', () => {
  it('受取人ごとに 暗号文・wrappedDek・メール・ヒント を返す', async () => {
    const s = await seedSubject(db);
    const c1 = await makeRecipient(s, 'mother@example.test', '犬の名前');
    const created = await createMessage(
      db,
      {
        subjectUserId: s,
        ...content,
        recipients: [{ connectionId: c1, wrappedDek: 'd3JhcA==' }],
      },
      cfg,
    );
    if (!created.ok) throw new Error('setup');

    const payloads = await resolveDisclosure(db, s);
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({
      messageId: created.messageId,
      ciphertext: content.ciphertext,
      wrappedDek: 'd3JhcA==',
      recipientEmail: 'mother@example.test',
      passphraseHint: '犬の名前',
    });
  });
});

describe('受取人ごとの開示解決（開示画面C・ADR-0011）', () => {
  // 開示ゲート成立を模す: その本人の death_certifications に outcome='disclosed' を1本入れる。
  async function markDisclosed(subjectUserId: string): Promise<void> {
    await db.insert(schema.deathCertifications).values({
      subjectUserId,
      stage: 'disclosed',
      outcome: 'disclosed',
      disclosedAt: NOW,
    });
  }

  it('開示成立前は空を返す（ゲート・成立前は暗号文を出さない）', async () => {
    const s = await seedSubject(db);
    const c1 = await makeRecipient(s, 'mother@example.test', '犬の名前');
    const created = await createMessage(
      db,
      {
        subjectUserId: s,
        ...content,
        recipients: [{ connectionId: c1, wrappedDek: 'd3JhcA==' }],
      },
      cfg,
    );
    if (!created.ok) throw new Error('setup');

    // 進行中エピソード（未開示）があってもゲートは通さない。
    await seedCertification(db, s, { stage: 'voting' });
    expect(await resolveDisclosureForRecipient(db, c1)).toHaveLength(0);
  });

  it('開示成立後は 差出人名・ヒント・暗号材料 を返す', async () => {
    const s = await seedSubject(db);
    const c1 = await makeRecipient(s, 'mother@example.test', '犬の名前');
    const created = await createMessage(
      db,
      {
        subjectUserId: s,
        ...content,
        recipients: [{ connectionId: c1, wrappedDek: 'd3JhcA==' }],
      },
      cfg,
    );
    if (!created.ok) throw new Error('setup');
    await markDisclosed(s);

    const rows = await resolveDisclosureForRecipient(db, c1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      messageId: created.messageId,
      ciphertext: content.ciphertext,
      iv: content.iv,
      wrappedDek: 'd3JhcA==',
      fromName: s, // seedSubject は name=id で作る
      passphraseHint: '犬の名前',
    });
  });

  it('同一受取人宛の複数伝言をまとめて返す（合言葉1回で全開封の土台）', async () => {
    const s = await seedSubject(db);
    const c1 = await makeRecipient(s, 'mother@example.test', '犬の名前');
    for (const w of ['ZDE=', 'ZDI=']) {
      const r = await createMessage(
        db,
        {
          subjectUserId: s,
          ...content,
          recipients: [{ connectionId: c1, wrappedDek: w }],
        },
        cfg,
      );
      if (!r.ok) throw new Error('setup');
    }
    await markDisclosed(s);

    const rows = await resolveDisclosureForRecipient(db, c1);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.wrappedDek).sort()).toEqual(['ZDE=', 'ZDI=']);
  });

  it('未知の connectionId（UUID書式・該当なし）は空を返す（中立応答）', async () => {
    expect(
      await resolveDisclosureForRecipient(
        db,
        '00000000-0000-0000-0000-000000000000',
      ),
    ).toHaveLength(0);
  });

  it('UUID書式でない connectionId も空を返す（DBへ渡さず中立化。ADR-0011 §2）', async () => {
    // uuid 列へ 'xxx' を渡すと Postgres が例外を投げ、公開ルートがエラー画面になって
    // 中立性が壊れる。書式段階で弾き、未知IDと同一の空応答にする。
    expect(await resolveDisclosureForRecipient(db, 'xxx')).toHaveLength(0);
    expect(await resolveDisclosureForRecipient(db, '')).toHaveLength(0);
  });
});

describe('一覧', () => {
  it('本人のメッセージと宛先つながりIDを返す', async () => {
    const s = await seedSubject(db);
    const c1 = await makeRecipient(s, 'a@example.test');
    await createMessage(
      db,
      {
        subjectUserId: s,
        ...content,
        recipients: [{ connectionId: c1, wrappedDek: 'ZDE=' }],
      },
      cfg,
    );
    const list = await listMessages(db, s);
    expect(list).toHaveLength(1);
    expect(list[0]?.recipientConnectionIds).toEqual([c1]);
  });
});
