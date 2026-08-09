import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';

/**
 * 「ページが見つからない」共通カード。2か所で同一表示にするため切り出す:
 *   - アプリ全体の未マッチURL（__root の notFoundComponent。例: /xxx）
 *   - ルート単位のデータ無し中立ページ（/disclosure の unavailable。ADR-0011 §2）
 * ブランド（アサトモWeb）を出し、認証状態に依らず正しく振り分く「/」へ戻す導線を置く。
 * カード様式は /login・/join と同じ中立カード（角丸20・大きめの影）に揃える。
 */
export function NotFoundCard() {
  return (
    <div className="grid min-h-screen place-items-center bg-background p-6">
      <div className="w-full max-w-109 rounded-[20px] bg-card px-7 py-8 text-center shadow-[0_8px_32px_rgb(0_0_0/0.08)]">
        {/* ブランドのワードマーク（BrandHeader と同じ意匠: アイコン＋「アサトモWeb」）。 */}
        <div className="mb-5 inline-flex items-center gap-2">
          <img
            src="/apple-touch-icon.png"
            alt=""
            aria-hidden
            width={24}
            height={24}
            className="block rounded-md"
          />
          <span className="text-lg font-bold tracking-[0.02em] text-foreground">
            アサトモWeb
          </span>
        </div>

        <h1 className="mb-2 text-lg text-foreground">
          お探しのページは見つかりませんでした
        </h1>
        <p className="mb-6 text-[13px] text-(--ink-3)">
          URL が変わったか、削除された可能性があります。
        </p>

        <Button asChild size="lg" className="h-auto w-full py-3 font-semibold">
          <Link to="/">トップページへ</Link>
        </Button>
      </div>
    </div>
  );
}
