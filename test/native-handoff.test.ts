import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db';
import {
  CHALLENGE_RE,
  challengeOf,
  createHandoffCode,
  redeemHandoffCode,
} from '../src/domain/native-handoff';
import { makeTestDb } from './helpers';

const NOW = new Date('2026-11-11T00:00:00Z');
const VERIFIER = 'verifier-known-only-to-the-app';

let db: Db;
let code: string;
beforeEach(async () => {
  db = await makeTestDb();
  code = await createHandoffCode(
    db,
    { sessionToken: 'sess', challenge: await challengeOf(VERIFIER) },
    NOW,
  );
});

describe('ネイティブ LINE ログインの受け渡しコード', () => {
  it('challenge は RFC 7636 の S256 と同じ形式', async () => {
    // RFC 7636 Appendix B のテストベクタ。Android 側の実装と食い違わないことの保証。
    const c = await challengeOf('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');
    expect(c).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
    expect(c).toMatch(CHALLENGE_RE);
  });

  it('正しい verifier で1回だけトークンに交換できる', async () => {
    expect(await redeemHandoffCode(db, { code, verifier: VERIFIER }, NOW)).toBe(
      'sess',
    );
    expect(
      await redeemHandoffCode(db, { code, verifier: VERIFIER }, NOW),
    ).toBeNull();
  });

  it('verifier が違えば交換できず、コードも失効する（横取り対策）', async () => {
    expect(
      await redeemHandoffCode(db, { code, verifier: 'attacker' }, NOW),
    ).toBeNull();
    expect(
      await redeemHandoffCode(db, { code, verifier: VERIFIER }, NOW),
    ).toBeNull();
  });

  it('期限切れ・未知のコードは交換できない', async () => {
    const later = new Date(NOW.getTime() + 2 * 60_000);
    expect(
      await redeemHandoffCode(db, { code, verifier: VERIFIER }, later),
    ).toBeNull();
    expect(
      await redeemHandoffCode(db, { code: 'nope', verifier: VERIFIER }, NOW),
    ).toBeNull();
  });
});
