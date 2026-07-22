import { config as loadDotenv } from 'dotenv';

/**
 * 開発スクリプトの共有ユーティリティ（環境変数の読み込み）。
 *
 * 方針（nafuda と同じ file-per-env・staging なし）:
 *   環境ごとに別ファイルを持ち、読むファイルでDBを分ける。
 *     - .env.local       … ローカル開発（開発DB）。dev スクリプトは常にこれを読む。
 *     - .env.production   … 本番（drizzle の `db:migrate:prod` からのみ参照）。
 *   dev スクリプトは .env.local しか読まないので、構造的に本番へは触れない
 *   （＝以前の「DB名ガード」は不要になったので撤去）。本番マイグレーションは
 *   drizzle.config.production.ts 経由の `npm run db:migrate:prod` だけが行う。
 */

/** .env.local を process.env に読み込む（既存値は上書きしない＝シェル指定が優先）。 */
export function loadEnv(): void {
  loadDotenv({ path: '.env.local' });
}
