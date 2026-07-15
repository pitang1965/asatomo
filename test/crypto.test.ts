import { describe, expect, it } from 'vitest';
import {
  encryptText,
  generateDek,
  openMessage,
  wrapDek,
} from '../src/web/crypto';

/**
 * ADR-0002 のゼロ知識暗号が実際に動くことのラウンドトリップ検証（Node の Web Crypto）。
 * 本人が暗号化し、受取人ごとの合言葉と本人マスター鍵にマルチラップ、開示側で復号できること。
 */
describe('最後のメッセージの暗号（ADR-0002）', () => {
  const PLAIN = '母へ。今まで本当にありがとう。ポチのことも、よろしくね。';

  it('本人が暗号化 → 受取人が合言葉で開ける', async () => {
    const dek = await generateDek();
    const { ciphertext, iv } = await encryptText(PLAIN, dek);
    const wrappedDek = await wrapDek(dek, '最初に飼った犬はポチ');

    // サーバは ciphertext / iv / wrappedDek だけを持つ。合言葉は持たない。
    const opened = await openMessage(
      { ciphertext, iv, wrappedDek },
      '最初に飼った犬はポチ',
    );
    expect(opened).toBe(PLAIN);
  });

  it('合言葉が違えば開けない（GCM認証失敗）', async () => {
    const dek = await generateDek();
    const { ciphertext, iv } = await encryptText(PLAIN, dek);
    const wrappedDek = await wrapDek(dek, '正しい合言葉');

    await expect(
      openMessage({ ciphertext, iv, wrappedDek }, 'ちがう合言葉'),
    ).rejects.toThrow();
  });

  it('本人はマスター鍵で、受取人は合言葉で、同じDEKを開ける（マルチラップ）', async () => {
    const dek = await generateDek();
    const { ciphertext, iv } = await encryptText(PLAIN, dek);
    const forRecipient = await wrapDek(dek, 'ふたりの合言葉');
    const forAuthor = await wrapDek(dek, '本人マスターパスフレーズ');

    expect(
      await openMessage(
        { ciphertext, iv, wrappedDek: forRecipient },
        'ふたりの合言葉',
      ),
    ).toBe(PLAIN);
    expect(
      await openMessage(
        { ciphertext, iv, wrappedDek: forAuthor },
        '本人マスターパスフレーズ',
      ),
    ).toBe(PLAIN);
  });

  it('毎回異なる暗号文になる（iv/saltがランダム）', async () => {
    const dek = await generateDek();
    const a = await encryptText(PLAIN, dek);
    const b = await encryptText(PLAIN, dek);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
  });
});
