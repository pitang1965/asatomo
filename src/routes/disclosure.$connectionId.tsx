import { createFileRoute } from '@tanstack/react-router';
import { fetchDisclosure } from '../server/functions';
import { MessageDisclosure } from '../web/MessageDisclosure';
import { NotFoundCard } from '../web/NotFoundCard';

/**
 * 受取人の開示画面(C)（ADR-0011）。開示メールのリンク /disclosure/{connectionId} の着地点。
 *   公開ルート（ログイン不要）。認可は推測不能な connectionId ＋ サーバ側の開示ゲート
 *   （death_certifications outcome='disclosed'）だけ。_app レイアウト配下に置かない。
 *   成立前・不正・削除は 'unavailable' に束ね、中立ページで存在を隠す（ADR-0011 §2）。
 *   合言葉入力は平文のみ（マスクなし。ADR-0011 §5）。復号は端末内（ADR-0002）。
 */
export const Route = createFileRoute('/disclosure/$connectionId')({
  loader: ({ params }) =>
    fetchDisclosure({ data: { connectionId: params.connectionId } }),
  component: DisclosurePage,
});

function DisclosurePage() {
  const data = Route.useLoaderData();

  if (data.status === 'ok')
    return (
      <div className="min-h-screen bg-background">
        <MessageDisclosure
          fromName={data.fromName}
          hint={data.hint}
          messages={data.messages}
        />
      </div>
    );

  // unavailable / unconfigured はいずれも、アプリ全体の 404 と同一表示にする（ADR-0011 §2 の
  // 中立応答を、未マッチURL /xxx とも見た目で揃える。存在の有無は依然として漏れない）。
  return <NotFoundCard />;
}
