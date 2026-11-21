/**
 * パス → 下タブの明示マップ（ADR-0008 §実装決定2）。
 *
 * URL の階層とナビ上の所属を切り離し、ここを唯一の真実にする。だから `/activity`・
 * `/connections` は URL を変えず「わたし」に属し、`/death/$subjectId` は URL 階層に
 * 乗らないまま「仲間」に属する。null = 下タブを出さない画面（ヘッダーのみ）。
 *
 * 向き（CONTEXT.md）とタブ境界を一致させる:
 *   - わたし = 見られる側の全部（生存シグナル送信・あなたの記録・見守ってくれる人の整理）
 *   - 仲間   = あなたが見守っている人（死亡確認フローもその延長）
 *   - 伝言   = 最後の伝言
 */
export type TabId = 'me' | 'watch' | 'messages';

export function activeTab(pathname: string): TabId | null {
  if (
    pathname === '/me' ||
    pathname === '/activity' ||
    pathname === '/connections'
  )
    return 'me';
  if (pathname === '/watch' || pathname.startsWith('/death/')) return 'watch';
  if (pathname === '/messages') return 'messages';
  // /account, /account/delete などはヘッダーのみ（管理系はタブに載せない）。
  return null;
}

/**
 * ログイン後の戻り先（`?redirect=`）の検証。オープンリダイレクト防止: 自サイト内の絶対パスのみ許可。
 * 先頭は '/'、2文字目は '/' でも '\' でもない（//evil.com・/\evil.com を弾く。
 * ブラウザは Location の '\' を '/' に正規化するため \ も別オリジンになりうる）。
 */
export function safeRedirect(value: unknown): string | undefined {
  return typeof value === 'string' && /^\/[^/\\]/.test(value)
    ? value
    : undefined;
}
