import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * 見守りWeb の開発プレビュー用 Vite 設定。実コンポーネント（WatchDashboard /
 * DeathConfirm / MessageDisclosure）をブラウザで確認するための最小構成。
 * 本番の SSR + API サーバールートは TanStack Start 土台で別途組む。
 */
export default defineConfig({
  plugins: [react()],
});
