/**
 * 最後のメッセージのクライアント側暗号（ADR-0002）。端末（ブラウザ/RN）で動く Web Crypto。
 * サーバは暗号文とラップ済みDEKしか持たず、平文も鍵（合言葉/本人鍵）も保持しない＝ゼロ知識。
 *
 * 流れ:
 *   本文 --AES-GCM(DEK)--> 暗号文
 *   DEK --合言葉由来鍵でラップ--> 受取人ごとの wrappedDek（開示後に受取人が復号）
 *   DEK --本人マスター鍵でラップ--> authorWrappedDek（本人が生前いつでも読み書き）
 * ラップは salt(16)+iv(12)+暗号文 を連結して base64 に収める（自己完結）。
 */

const enc = new TextEncoder();
const dec = new TextDecoder();
const PBKDF2_ITERATIONS = 200_000;

function toB64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function fromB64(s: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

export async function generateDek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
}

export async function encryptText(
  plaintext: string,
  dek: CryptoKey,
): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    dek,
    enc.encode(plaintext),
  );
  return { ciphertext: toB64(ct), iv: toB64(iv.buffer) };
}

export async function decryptText(
  ciphertext: string,
  iv: string,
  dek: CryptoKey,
): Promise<string> {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(iv) },
    dek,
    fromB64(ciphertext),
  );
  return dec.decode(pt);
}

async function deriveWrapKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** DEK を合言葉（または本人マスターパスフレーズ）由来の鍵で包む。 */
export async function wrapDek(
  dek: CryptoKey,
  passphrase: string,
): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', dek);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapKey = await deriveWrapKey(passphrase, salt);
  const wrapped = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    wrapKey,
    raw,
  );
  const out = new Uint8Array(16 + 12 + wrapped.byteLength);
  out.set(salt, 0);
  out.set(iv, 16);
  out.set(new Uint8Array(wrapped), 28);
  return toB64(out.buffer);
}

/** ラップ済みDEKを合言葉で開ける。合言葉が違えば GCM 認証失敗で例外。 */
export async function unwrapDek(
  packed: string,
  passphrase: string,
): Promise<CryptoKey> {
  const buf = fromB64(packed);
  const salt = buf.slice(0, 16);
  const iv = buf.slice(16, 28);
  const wrapped = buf.slice(28);
  const wrapKey = await deriveWrapKey(passphrase, salt);
  const raw = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    wrapKey,
    wrapped,
  );
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, [
    'encrypt',
    'decrypt',
  ]);
}

/** 受取人の開示: ラップ済みDEKを合言葉で開け、本文を復号する。 */
export async function openMessage(
  packed: { ciphertext: string; iv: string; wrappedDek: string },
  passphrase: string,
): Promise<string> {
  const dek = await unwrapDek(packed.wrappedDek, passphrase);
  return decryptText(packed.ciphertext, packed.iv, dek);
}
