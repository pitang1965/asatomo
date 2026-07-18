import startHandler from '@tanstack/react-start/server-entry';
import { runMonitoringTick } from '../cron/monitoring-tick';
import { createRequestApp } from './app';
import { getServerEnv } from './env';

/**
 * Cloudflare Workers エントリ（wrangler.jsonc の main）。
 *   - fetch: TanStack Start（SSR + /api/*）へそのまま委譲。
 *   - scheduled: 監視tick（時間駆動の状態遷移 T1/T2/T5。約15分間隔の Cron Triggers）。
 * 環境変数は nodejs_compat により vars/secrets が process.env に写る（src/server/env.ts）。
 */

interface Ctx {
  waitUntil(promise: Promise<unknown>): void;
}

export default {
  fetch: (request: Request, env: unknown, ctx: unknown) =>
    startHandler.fetch(request, env, ctx),

  async scheduled(_controller: unknown, _env: unknown, ctx: Ctx) {
    const app = createRequestApp(getServerEnv());
    ctx.waitUntil(
      runMonitoringTick(app.db, app.notify, {
        stage1to2DelayHours: 12,
        batchLimit: 20,
      }),
    );
  },
};
