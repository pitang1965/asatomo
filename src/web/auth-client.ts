import { genericOAuthClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

/**
 * ブラウザ側の認証クライアント。/api/auth/*（api.auth.$ サーバールート）に向く。
 * Google / Facebook は signIn.social、LINE は genericOAuth（signIn.oauth2）。
 */
export const authClient = createAuthClient({
  plugins: [genericOAuthClient()],
});
