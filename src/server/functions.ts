import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { type DashboardRow, getWatcherDashboard } from '../domain/queries';
import { ConfigError, createRequestApp } from './app';
import { getServerEnv } from './env';

/**
 * 見守りWeb 用のサーバー関数（ローダーから RPC で呼ぶ）。
 * 状態を3値で返し、画面側は「未設定 → 案内 / 未ログイン → ログイン / OK → 実データ」に分岐する。
 */
export type DashboardData =
  | { status: 'unconfigured'; message: string }
  | { status: 'signed_out' }
  | { status: 'ok'; userName: string; rows: DashboardRow[] };

export const fetchDashboard = createServerFn({ method: 'GET' }).handler(
  async (): Promise<DashboardData> => {
    let app: ReturnType<typeof createRequestApp>;
    try {
      app = createRequestApp(getServerEnv());
    } catch (e) {
      if (e instanceof ConfigError)
        return { status: 'unconfigured', message: e.message };
      throw e;
    }

    const request = getRequest();
    const session = await app.auth.api.getSession({
      headers: request.headers,
    });
    if (!session) return { status: 'signed_out' };

    return {
      status: 'ok',
      userName: session.user.name,
      rows: await getWatcherDashboard(app.db, session.user.id),
    };
  },
);
