import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

/** TanStack Start が要求するルーターファクトリ（リクエスト/クライアントごとに生成）。 */
export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
  });
}
