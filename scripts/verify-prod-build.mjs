// 本番ビルド（npm run build:cf）の出力が本番D1を向いていることを検査する。
// 開発用ビルド（npm run build）の dist を deploy すると本番が開発DBに繋がるため、デプロイ前に止める。
import { readFileSync } from 'node:fs';

const path = 'dist/server/wrangler.json';
const cfg = JSON.parse(readFileSync(path, 'utf8'));
// wrangler.jsonc の本番D1と同じ値（D1を作り直したらここも更新する）。
const PROD_DB_ID = 'f813b2c4-cc66-4830-ade5-0457f81266eb';
const dbs = cfg.d1_databases ?? [];

if (
  dbs.length !== 1 ||
  dbs[0].database_name !== 'asatomo-db-prod' ||
  dbs[0].database_id !== PROD_DB_ID
) {
  console.error(
    `✖ ${path} のD1が本番ではありません: ${JSON.stringify(dbs.map((d) => [d.database_name, d.database_id]))}\n  開発用ビルドの可能性があります。npm run build:cf で作り直してください。`,
  );
  process.exit(1);
}
if (cfg.vars?.DEV_BEARER_SECRET !== undefined) {
  console.error('✖ DEV_BEARER_SECRET が本番ビルドに含まれています。');
  process.exit(1);
}
console.log('✔ 本番ビルド確認OK（asatomo-db-prod）');
