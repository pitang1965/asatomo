import { createFileRoute, Link } from '@tanstack/react-router';
import { type CSSProperties, useState } from 'react';
import type { WatchedSubjectImpact } from '../domain/account';
import { fetchAccountDeletePreview } from '../server/functions';
import { authClient } from '../web/auth-client';

/**
 * アカウント削除の確認画面（/account/delete。ADR-0007）。
 *
 * 安全の要（grill 2026-07-21）: 削除は即時・不可逆。誤削除への防御は「可逆性」ではなく
 * 「情報つきの摩擦」で与える。ここで、あなたが抜けることで網が縮む本人ごとの結果
 * （0人になる / 開示ラインを割る）を事前に見せる。最終確認はチェックボックス1つ＋赤い実行ボタン。
 *
 * ファイル名は account_.delete.tsx（親セグメントの末尾 `_`）。これで /account レイアウトの
 * 入れ子から外れ、独立フルページになる。account.tsx は Outlet を持たないため、入れ子のままだと
 * /account/delete が描画されない（＝「押しても何も起きない」）。URL は /account/delete のまま。
 */
export const Route = createFileRoute('/account_/delete')({
  loader: () => fetchAccountDeletePreview(),
  component: DeletePage,
});

const page: CSSProperties = {
  background: 'var(--bg)',
  minHeight: '100vh',
  fontFamily: 'var(--font-jp)',
};

const card: CSSProperties = {
  background: 'var(--surface)',
  borderRadius: 16,
  padding: 20,
  maxWidth: 480,
  margin: '16px auto',
  boxShadow: 'var(--shadow-sm)',
};

function DeletePage() {
  const data = Route.useLoaderData();

  if (data.status === 'unconfigured')
    return <Center title="サーバーが未設定です" body={data.message} />;
  if (data.status === 'signed_out')
    return (
      <Center
        title="ログインが必要です"
        body="アカウントの削除は、ご本人のアカウントでログインして行います。"
      />
    );

  return <Confirm preview={data.preview} />;
}

function impactLine(s: WatchedSubjectImpact): {
  text: string;
  strong: boolean;
} {
  if (s.leavesEmpty)
    return {
      text: `${s.subjectName}さんの見守りが0人になります（誰も見守れなくなります）。`,
      strong: true,
    };
  if (s.dropsBelowDisclosureLine)
    return {
      text: `${s.subjectName}さんは見守り者が${s.currentLivingWatchers}人→${s.resultingLivingWatchers}人になり、そのままだと最後のメッセージを届けられなくなります。`,
      strong: true,
    };
  return {
    text: `${s.subjectName}さんの見守り者が${s.currentLivingWatchers}人→${s.resultingLivingWatchers}人になります。`,
    strong: false,
  };
}

function Confirm({
  preview,
}: {
  preview: {
    watchedSubjects: WatchedSubjectImpact[];
    watchersOnYou: number;
  };
}) {
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function execute() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) throw new Error(`delete failed: ${res.status}`);
      // セッションはサーバー側で消えている。クライアントの Cookie も念のためクリア。
      await authClient.signOut().catch(() => {});
      setDone(true);
    } catch {
      setError('うまくいきませんでした。時間をおいてお試しください。');
      setBusy(false);
    }
  }

  if (done)
    return (
      <Center
        title="削除が完了しました"
        body="アサトモのアカウントとデータを削除しました。これまでご利用いただき、ありがとうございました。"
      />
    );

  const { watchedSubjects, watchersOnYou } = preview;

  return (
    <div style={page}>
      <div style={{ padding: '10px 16px', fontSize: 13 }}>
        <Link to="/account" style={{ color: 'var(--accent)' }}>
          ← もどる
        </Link>
      </div>

      <div style={card}>
        <h1 style={{ fontSize: 18, color: 'var(--ink)', margin: 0 }}>
          アカウントを削除しますか？
        </h1>
        <p
          style={{
            fontSize: 13,
            color: 'var(--ink-2)',
            lineHeight: 1.9,
            margin: '10px 0 0',
          }}
        >
          削除は<strong>すぐに反映され、元に戻せません</strong>。
          あなたが用意した最後のメッセージと宛先も削除されます。
        </p>

        {watchedSubjects.length > 0 ? (
          <div
            style={{
              marginTop: 16,
              background: 'var(--danger-soft)',
              borderRadius: 12,
              padding: '12px 14px',
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--ink)',
              }}
            >
              あなたが見守っている人への影響
            </p>
            <ul
              style={{
                margin: '8px 0 0',
                paddingLeft: 18,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              {watchedSubjects.map((s) => {
                const { text, strong } = impactLine(s);
                return (
                  <li
                    key={s.subjectUserId}
                    style={{
                      fontSize: 13,
                      lineHeight: 1.7,
                      color: 'var(--ink)',
                      fontWeight: strong ? 700 : 400,
                    }}
                  >
                    {text}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {watchersOnYou > 0 ? (
          <p
            style={{
              margin: '14px 0 0',
              fontSize: 13,
              color: 'var(--ink-2)',
              lineHeight: 1.8,
            }}
          >
            あなたを見守ってくれている{watchersOnYou}
            人には、「利用をやめた」ことをお知らせします。
          </p>
        ) : null}

        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            marginTop: 18,
            fontSize: 13,
            color: 'var(--ink)',
            lineHeight: 1.7,
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            style={{ marginTop: 3, width: 18, height: 18, flexShrink: 0 }}
          />
          <span>
            上記を理解し、アカウントとデータを完全に削除することに同意します。
          </span>
        </label>

        {error ? (
          <p
            style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--danger)' }}
          >
            {error}
          </p>
        ) : null}

        {/* 「やめておく」を先・実ボタンで（取り消せない操作では安全な出口を目立たせる）。
            削除は下・赤だがチェックボックスで守られているので目立ってよい。 */}
        <Link
          to="/account"
          style={{
            display: 'block',
            width: '100%',
            marginTop: 16,
            padding: '13px 16px',
            borderRadius: 12,
            fontWeight: 700,
            fontSize: 15,
            textAlign: 'center',
            textDecoration: 'none',
            border: '1px solid var(--line)',
            background: 'var(--surface-2)',
            color: 'var(--ink)',
            boxSizing: 'border-box',
          }}
        >
          やめておく
        </Link>

        <button
          type="button"
          onClick={execute}
          disabled={!agreed || busy}
          style={{
            appearance: 'none',
            border: 0,
            cursor: agreed && !busy ? 'pointer' : 'not-allowed',
            width: '100%',
            marginTop: 10,
            padding: '13px 16px',
            borderRadius: 12,
            fontWeight: 700,
            fontSize: 15,
            background: agreed ? 'var(--danger)' : 'var(--surface-2)',
            color: agreed ? '#fff' : 'var(--ink-3)',
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? '削除しています…' : 'アカウントを削除する'}
        </button>
      </div>
    </div>
  );
}

function Center({ title, body }: { title: string; body: string }) {
  return (
    <div
      style={{ ...page, display: 'grid', placeItems: 'center', padding: 24 }}
    >
      <div style={{ ...card, textAlign: 'center' }}>
        <h1 style={{ fontSize: 18, color: 'var(--ink)', marginBottom: 12 }}>
          {title}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.8 }}>
          {body}
        </p>
      </div>
    </div>
  );
}
