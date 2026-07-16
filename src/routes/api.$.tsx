import { createFileRoute } from '@tanstack/react-router';
import { dispatch } from '../api/router';
import { getActorUserId } from '../api/session';
import { ConfigError, createRequestApp } from '../server/app';
import { getServerEnv } from '../server/env';

/**
 * アプリ API のサーバールート（/api/*）。/api/auth/* はより特定的な api.auth.$ が先に取る。
 * 認証（セッション → actorUserId）だけここで解決し、検証・認可・ドメインは dispatch 以下に委譲。
 */
export const Route = createFileRoute('/api/$')({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        let app: ReturnType<typeof createRequestApp>;
        try {
          app = createRequestApp(getServerEnv());
        } catch (e) {
          if (e instanceof ConfigError)
            return Response.json(
              { error: 'server_not_configured', message: e.message },
              { status: 503 },
            );
          throw e;
        }

        const actorUserId = await getActorUserId(request, app.auth);
        const path = new URL(request.url).pathname.replace(/^\/api/, '');
        const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
        const body = hasBody
          ? await request.json().catch(() => undefined)
          : undefined;
        return dispatch(app.handlers, request.method, path, actorUserId, body);
      },
    },
  },
});
