import { createDb } from '../src/db';
import {
  connections,
  deathCertifications,
  legacyMessages,
  messageRecipients,
  subjectSettings,
  user,
} from '../src/db/schema';
import { encryptText, generateDek, wrapDek } from '../src/web/crypto';
import { loadEnv } from './dev-db';

/**
 * 開発用: 受取人の開示画面(C)を最短で確認する（ADR-0011）。
 *   「開示成立済み」の本人・純Web受取人（アカウント無し・externalEmail）・暗号化した伝言を
 *   本物のクライアント暗号（src/web/crypto の Web Crypto）で用意し、開示ゲート
 *   （death_certifications outcome='disclosed'）まで立てる。tick もメール送信も通さず、
 *   /disclosure/{connectionId} を開いて合言葉「ポチ」で復号 → 手紙表示を確認できる。
 *
 * 実行: npx tsx scripts/dev-disclose.ts
 * 冪等（固定IDで upsert）。参照は .env.local（開発DB）のみ＝本番へは触れない。
 *
 * ※ 状態機械の tick 経由（certified_grace → 開示）や実メール送信まで含めた
 *   フル配線の検証は別（末尾のメモ参照）。ここは今回作った「画面C＋ゲート付きクエリ」の直接検証。
 */
loadEnv();
if (!process.env.DATABASE_URL)
  throw new Error('DATABASE_URL がありません（.env.local を確認してください）');
const db = createDb(process.env.DATABASE_URL);

const SUBJECT_ID = 'seed-subject-disclose';
const CONNECTION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccc01';
const MESSAGE_ID = 'dddddddd-dddd-4ddd-8ddd-ddddddddd001';
const CERT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeee001';
const PASSPHRASE = 'ポチ';
const LETTER =
  'みなみへ\n\nいつも、そばにいてくれてありがとう。\nどうか、元気で。';

async function main() {
  const now = new Date();

  // 本人（差出人）。表示名が開示画面の「〇〇さんより」になる。
  await db
    .insert(user)
    .values({
      id: SUBJECT_ID,
      name: '佐藤 健太（開示テスト）',
      email: 'seed-disclose@example.invalid',
    })
    .onConflictDoNothing();

  await db
    .insert(subjectSettings)
    .values({ userId: SUBJECT_ID, state: 'disclosed', stateChangedAt: now })
    .onConflictDoUpdate({
      target: subjectSettings.userId,
      set: { state: 'disclosed', stateChangedAt: now },
    });

  // 純Web受取人（アカウント無し = externalEmail）。connectionId が URL の capability。
  const conn = {
    id: CONNECTION_ID,
    subjectUserId: SUBJECT_ID,
    otherUserId: null,
    externalEmail: 'grieving@example.invalid',
    displayName: '母',
    isWatcher: false,
    passphraseHint: '最初に飼った犬の名前（テスト: ポチ）',
  };
  await db
    .insert(connections)
    .values(conn)
    .onConflictDoUpdate({ target: connections.id, set: conn });

  // 本物のクライアント暗号（ADR-0002）: DEK で本文を暗号化し、合言葉「ポチ」で DEK を包む。
  const dek = await generateDek();
  const { ciphertext, iv } = await encryptText(LETTER, dek);
  const wrappedDek = await wrapDek(dek, PASSPHRASE);
  const authorWrappedDek = await wrapDek(dek, 'author-dummy'); // 本人読み書き用（本テストでは未使用）

  const msg = {
    id: MESSAGE_ID,
    subjectUserId: SUBJECT_ID,
    encryptedLabel: 'bGFiZWw=', // 開示画面は見出しを表示しないのでダミーで可
    ciphertext,
    iv,
    cipherAlgo: 'AES-GCM',
    authorWrappedDek,
    updatedAt: now,
  };
  await db
    .insert(legacyMessages)
    .values(msg)
    .onConflictDoUpdate({ target: legacyMessages.id, set: msg });

  const rec = {
    id: 'ffffffff-ffff-4fff-8fff-ffffffffff01',
    messageId: MESSAGE_ID,
    connectionId: CONNECTION_ID,
    wrappedDek,
  };
  await db
    .insert(messageRecipients)
    .values(rec)
    .onConflictDoUpdate({ target: messageRecipients.id, set: rec });

  // 開示ゲート: outcome='disclosed' の認定を1本立てる（これが無いとクエリは空＝中立404）。
  const cert = {
    id: CERT_ID,
    subjectUserId: SUBJECT_ID,
    stage: 'disclosed' as const,
    outcome: 'disclosed' as const,
    disclosedAt: now,
    graceUntil: null,
    cancelReason: null,
    cancelledAt: null,
    updatedAt: now,
  };
  await db
    .insert(deathCertifications)
    .values(cert)
    .onConflictDoUpdate({ target: deathCertifications.id, set: cert });

  console.log('開示テストの準備ができました（開発DB）。');
  console.log('');
  console.log('  1) 別ターミナルで dev サーバーを起動:  npm run dev');
  console.log('  2) ブラウザで次を開く:');
  console.log(`       http://localhost:5173/disclosure/${CONNECTION_ID}`);
  console.log(
    `  3) 合言葉に「${PASSPHRASE}」を入力 → 手紙が表示されれば成功。`,
  );
  console.log('');
  console.log(
    '  ゲート確認: 下の cert を outcome=in_progress 等に変えると中立404になる。',
  );
  console.log(
    `  片付け: この本人(${SUBJECT_ID})関連行を消せば元に戻る（cascade）。`,
  );
}

main().then(() => process.exit(0));
