import { createFileRoute, Link } from '@tanstack/react-router';
import { Card } from '@/components/ui/card';
import type { SignalKind } from '../domain/monitoring';
import {
  absoluteJa,
  recentActivityText,
  signalTrueLabel,
} from '../domain/recent-activity';
import { fetchActivityHistory } from '../server/functions';

/**
 * 自分のアクティビティ履歴（本人側・透明性の画面。機能: 自分の記録が相手にどう見えるか）。
 *
 * 設計（grill 決定 2026-07-23）:
 *   - 履歴は本人だけに見せる。自分のデータなのでぼかさず「真の種別＋絶対時刻」で全件見せる
 *     （透明性: 何が記録されているかを隠さない。CONTEXT.md 生存シグナル/近況）。
 *   - 見守り者に見えるのは常に「その時点の最新1件」のみ・ぼかし・相対時刻。よって
 *     「見守り者にはこう見えます」の対比は最新1件にだけ添える（過去エントリには添えない。
 *     相手の閲覧時刻次第で相対表示は変わり、そもそも過去分は相手からは見えないため）。
 *   - Web に置く（本人の稀な確認系。ADR-0006 の面の切り分け）。iPhone 本人もここへ来られる。
 */
export const Route = createFileRoute('/_app/activity')({
  loader: () => fetchActivityHistory(),
  component: ActivityPage,
});

// カードのレイアウト（見た目は Card 部品が持つ）。box-sizing:border-box のため外枠は
// 旧 content-box の実測（maxWidth560 + padding20×2 = 600px）に合わせて max-w-150。
const cardW = 'mx-auto my-4 max-w-150';

function ActivityPage() {
  const data = Route.useLoaderData();

  if (data.status === 'unconfigured')
    return <Center title="サーバーが未設定です" body={data.message} />;
  if (data.status === 'signed_out')
    return (
      <Center
        title="ログインが必要です"
        body="自分の記録の確認は、ご本人のアカウントで行います。"
      />
    );

  return (
    <History
      isSubject={data.isSubject}
      entries={data.entries.map((e) => ({
        id: e.id,
        kind: e.kind,
        occurredAt: new Date(e.occurredAt),
      }))}
    />
  );
}

function History({
  isSubject,
  entries,
}: {
  isSubject: boolean;
  entries: { id: string; kind: SignalKind; occurredAt: Date }[];
}) {
  const now = new Date();
  const latest = entries[0] ?? null;

  return (
    <div className="min-h-screen bg-background">
      <Card className={cardW}>
        <h1 className="m-0 text-[17px] text-foreground">あなたの記録</h1>
        <p className="mt-2 mb-0 text-xs leading-[1.8] text-muted-foreground">
          {isSubject
            ? 'アサトモが記録している、あなたの「元気」の一覧です。見守ってくれている人に見えるのは、いちばん上の最新の1件だけです。'
            : 'アサトモが記録している、あなたの「元気」の一覧です。いまは見守ってくれる人がいないので、この記録はまだ誰にも届いていません。'}
        </p>

        {/* 見守り者にどう見えるかの対比は、最新1件にだけ添える（相手に見えるのは最新1件のみ）。 */}
        {isSubject && latest ? (
          <div className="mt-3.5 rounded-[10px] bg-(--good-soft) px-3 py-2.5">
            <p className="m-0 text-xs leading-[1.7] text-muted-foreground">
              いま見守り者に見えているのは、この最新の1件だけです：
            </p>
            <p className="mt-1 mb-0 text-sm font-semibold text-foreground">
              「{recentActivityText(latest.kind, latest.occurredAt, now)}」
            </p>
            <p className="mt-1.5 mb-0 text-[11px] leading-[1.7] text-muted-foreground">
              時刻はぼかされ、相対的に表示されます（「いってきます」は「元気にしていました」とだけ伝わります）。
            </p>
          </div>
        ) : null}

        {entries.length === 0 ? (
          <p className="mt-4 mb-0 text-[13px] leading-[1.8] text-muted-foreground">
            まだ記録がありません。
            <br />
            アプリや見守りWebを使うと、ここに「元気」が残っていきます。
          </p>
        ) : (
          <ul className="mt-3.5 mb-0 flex list-none flex-col gap-2 p-0">
            {entries.map((e, i) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-2.5 rounded-xl border border-border bg-secondary px-3 py-2.5"
              >
                <span className="text-sm font-semibold text-foreground">
                  {signalTrueLabel(e.kind)}
                  {i === 0 && isSubject ? (
                    <span className="ml-2 text-[10px] font-semibold text-(--good)">
                      見守り者に表示中
                    </span>
                  ) : null}
                </span>
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {absoluteJa(e.occurredAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Center({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-background p-6">
      <Card className={`${cardW} text-center`}>
        <h1 className="mb-3 text-lg text-foreground">{title}</h1>
        <p className="text-[13px] leading-[1.8] text-muted-foreground">
          {body}
        </p>
        <p className="mt-5 text-[13px]">
          <Link to="/" className="text-primary hover:underline">
            ← トップへ
          </Link>
        </p>
      </Card>
    </div>
  );
}
