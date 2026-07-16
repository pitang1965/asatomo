import { createFileRoute } from '@tanstack/react-router';
import { ConfigError, createRequestApp } from '../server/app';
import { getServerEnv } from '../server/env';

/** Better Auth のエンドポイント（/api/auth/*）。OAuth コールバック・セッション等を委譲。 */
export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        try {
          const { auth } = createRequestApp(getServerEnv());
          return await auth.handler(request);
        } catch (e) {
          if (e instanceof ConfigError)
            return Response.json(
              { error: 'server_not_configured', message: e.message },
              { status: 503 },
            );
          throw e;
        }
      },
    },
  },
});
