/**
 * OGP画像(1200x630)生成スクリプト
 *
 * 素材(いずれも本番では配信しない・再生成の元):
 *   - art/hero-source.png : ヒーローイラスト(正方形想定)
 *   - public/icons/icon-512.png : アサトモのロゴマーク
 *
 * 使い方:
 *   node_modules/.bin/tsx scripts/build-ogp.ts
 *
 * 出力:
 *   - .scratch/ogp-a.png (案A: 左テキスト＋右イラスト)
 *   - .scratch/ogp-b.png (案B: 全面イラスト＋上部オーバーレイ)
 * 確定後に public/ogp.png へコピーする。
 */
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const HERO = resolve(root, 'art/hero-source.png');
const LOGO = resolve(root, 'public/icons/icon-512.png');
const OUT_DIR = resolve(root, '.scratch');

const W = 1200;
const H = 630;

// ブランドカラー
const FONT =
  "'Yu Gothic UI','Yu Gothic','Meiryo','Hiragino Kaku Gothic ProN',sans-serif";
const INK = '#3a2e28'; // 見出し(濃茶)
const MUTED = '#8a7f78'; // URL等

// イラスト内側の「場面」枠(上部の焼き込み見出し・ロゴを除いたベッド〜スマホ)。
// hero-source 1024x1024 前提の実測値。両端のスマホを切らないための領域。
const SCENE = { left: 28, top: 300, width: 968, height: 700 };

function svgBuffer(svg: string) {
  return Buffer.from(svg);
}

/** 焼き込み見出しを除いた「場面」だけを抜き出す */
function sceneExtract() {
  return sharp(HERO).extract(SCENE);
}

/** 案A: 左テキストパネル + 右イラスト */
async function variantA(): Promise<Buffer> {
  const panelW = 560;
  const heroW = W - panelW;

  // 背景(暖色グラデ 全面)
  const bg = svgBuffer(`
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#FFEAD8"/>
          <stop offset="0.55" stop-color="#FDEFEF"/>
          <stop offset="1" stop-color="#F3F4FB"/>
        </linearGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#g)"/>
    </svg>`);

  // 場面を右領域にカードとして収める(contain)。両端のスマホを切らない。
  const cardW = heroW - 72; // 左右に余白
  const cardH = H - 72;
  const scene = await sceneExtract()
    .resize(cardW - 36, cardH - 36, { fit: 'contain', background: '#ffffff' })
    .toBuffer();
  const cardX = panelW + 36;
  const cardY = 36;

  // 白カード(角丸＋やわらかい影)
  const card = svgBuffer(`
    <svg width="${cardW}" height="${cardH}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="s" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="6" stdDeviation="14" flood-color="#d8a98f" flood-opacity="0.35"/>
        </filter>
      </defs>
      <rect x="6" y="6" width="${cardW - 12}" height="${cardH - 12}" rx="28" fill="#ffffff" filter="url(#s)"/>
    </svg>`);

  // テキスト
  const text = svgBuffer(`
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <style>
        .brand{font-family:${FONT};font-weight:700;fill:${INK};font-size:46px;}
        .h{font-family:${FONT};font-weight:700;fill:${INK};font-size:46px;letter-spacing:1px;}
        .url{font-family:${FONT};font-weight:600;fill:${MUTED};font-size:26px;letter-spacing:1px;}
      </style>
      <text x="176" y="152" class="brand">アサトモ</text>
      <text x="72" y="292" class="h">一人暮らしの朝を、</text>
      <text x="72" y="360" class="h">誰かがゆるく</text>
      <text x="72" y="428" class="h">知ってる安心。</text>
      <text x="72" y="556" class="url">asatomo.nafuda.me</text>
    </svg>`);

  const logo = await sharp(LOGO).resize(84, 84).toBuffer();

  return sharp(bg)
    .composite([
      { input: card, left: panelW + 36, top: 36 },
      { input: scene, left: cardX + 18, top: cardY + 18 },
      { input: logo, left: 72, top: 96 },
      { input: text, left: 0, top: 0 },
    ])
    .png()
    .toBuffer();
}

/** 案B: 全面イラスト + 上部オーバーレイ見出し */
async function variantB(): Promise<Buffer> {
  // 焼き込み見出しを除いた場面を全面敷き(中央寄せcover)
  const hero = await sceneExtract()
    .resize(W, H, { fit: 'cover', position: 'centre' })
    .toBuffer();

  const overlay = svgBuffer(`
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="o" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#FFF6EE" stop-opacity="0.94"/>
          <stop offset="1" stop-color="#FFF6EE" stop-opacity="0"/>
        </linearGradient>
        <style>
          .h{font-family:${FONT};font-weight:700;fill:${INK};font-size:44px;letter-spacing:1px;}
          .url{font-family:${FONT};font-weight:600;fill:${MUTED};font-size:24px;}
        </style>
      </defs>
      <rect x="0" y="0" width="${W}" height="230" fill="url(#o)"/>
      <text x="60" y="86" class="h">一人暮らしの朝を、誰かがゆるく知ってる安心。</text>
      <text x="60" y="140" class="url">asatomo.nafuda.me</text>
    </svg>`);

  const logo = await sharp(LOGO).resize(72, 72).toBuffer();

  return sharp(hero)
    .composite([
      { input: overlay, left: 0, top: 0 },
      { input: logo, left: W - 96, top: 24 },
    ])
    .png()
    .toBuffer();
}

/** 案C: 中央セーフ(全面イラスト＋中央寄せ見出し) — LINEの正方形クロップでも成立 */
async function variantC(): Promise<Buffer> {
  // 焼き込み見出しを除いた場面を全面敷き(中央寄せcover)
  const hero = await sceneExtract()
    .resize(W, H, { fit: 'cover', position: 'centre' })
    .toBuffer();

  // ロゴ＋見出しを上下中央(胸のあたり)へ。顔にかからないよう中央帯で可読性を確保。
  // 見出し・ロゴ・URLは中央630px内に収め、LINEの正方形クロップに耐える。
  const cx = W / 2;
  const bandTop = 210;
  const bandH = 210;
  const overlay = svgBuffer(`
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="band" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#FFF4EA" stop-opacity="0"/>
          <stop offset="0.22" stop-color="#FFF4EA" stop-opacity="0.92"/>
          <stop offset="0.78" stop-color="#FFF4EA" stop-opacity="0.92"/>
          <stop offset="1" stop-color="#FFF4EA" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="u" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#FFF4EA" stop-opacity="0"/>
          <stop offset="1" stop-color="#FFF4EA" stop-opacity="0.92"/>
        </linearGradient>
        <style>
          .brand{font-family:${FONT};font-weight:700;fill:${INK};font-size:32px;text-anchor:middle;}
          .h{font-family:${FONT};font-weight:700;fill:${INK};font-size:42px;letter-spacing:1px;text-anchor:middle;}
          .url{font-family:${FONT};font-weight:600;fill:${MUTED};font-size:26px;text-anchor:middle;}
        </style>
      </defs>
      <rect x="0" y="${bandTop}" width="${W}" height="${bandH}" fill="url(#band)"/>
      <rect x="0" y="${H - 96}" width="${W}" height="96" fill="url(#u)"/>
      <text x="${cx + 20}" y="272" class="brand">アサトモ</text>
      <text x="${cx}" y="342" class="h">一人暮らしの朝を、</text>
      <text x="${cx}" y="398" class="h">誰かがゆるく知ってる安心。</text>
      <text x="${cx}" y="${H - 30}" class="url">asatomo.nafuda.me</text>
    </svg>`);

  const logo = await sharp(LOGO).resize(46, 46).toBuffer();

  return sharp(hero)
    .composite([
      { input: overlay, left: 0, top: 0 },
      { input: logo, left: Math.round(cx - 92), top: 232 },
    ])
    .png()
    .toBuffer();
}

async function main() {
  if (!existsSync(HERO)) {
    console.error(
      `\n[!] ヒーロー画像がありません: ${HERO}\n    イラストを public/hero-source.png として保存してから再実行してください。\n`,
    );
    process.exit(1);
  }
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  const a = await variantA();
  await sharp(a).toFile(resolve(OUT_DIR, 'ogp-a.png'));
  const b = await variantB();
  await sharp(b).toFile(resolve(OUT_DIR, 'ogp-b.png'));
  const c = await variantC();
  await sharp(c).toFile(resolve(OUT_DIR, 'ogp-c.png'));

  // LINE相当(中央正方形)クロップのシミュレーション
  for (const v of ['a', 'b', 'c']) {
    await sharp(resolve(OUT_DIR, `ogp-${v}.png`))
      .extract({ left: 285, top: 0, width: 630, height: 630 })
      .toFile(resolve(OUT_DIR, `ogp-${v}-line.png`));
  }

  // --- 本番アセット確定(採用: 案C) ---
  // OGP: 案Cを圧縮最適化して public/ogp.png へ。
  await sharp(c)
    .png({ compressionLevel: 9, effort: 10, quality: 90 })
    .toFile(resolve(root, 'public/ogp.png'));

  // ランディング用ヒーロー: 焼き込み見出し・ロゴを除いた「場面のみ」。
  // webp本命＋jpegフォールバック(iOS14未満やWebP非対応環境向け。<picture>で出し分け)。
  await sceneExtract().webp({ quality: 80 }).toFile(resolve(root, 'public/hero.webp'));
  await sceneExtract()
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(resolve(root, 'public/hero.jpg'));

  console.log('生成完了:');
  console.log('  .scratch/ogp-a.png / -b.png / -c.png (横長プレビュー)');
  console.log('  .scratch/ogp-*-line.png (LINE正方形クロップ相当)');
  console.log('  public/ogp.png (採用: 案C・最適化済み)');
  console.log('  public/hero.webp (ランディング用ヒーロー・場面のみ)');
}

main();
