import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { type CSSProperties, useState } from 'react';
import { fetchShell } from '../server/functions';

/**
 * ルート（/）。ADR-0008 で役割を分けた:
 *   - 未設定 → セットアップ案内
 *   - 未ログイン → 暫定ランディング（ログインは独立した /login へ誘導）
 *   - ログイン済み → 既定タブ /me へリダイレクト（ダッシュボードは /me・/watch へ移設済み）
 * ランディングは暫定・最小限。本格化は宣伝フェーズ（MEMORY の方針に従う）。
 */
export const Route = createFileRoute('/')({
  // ?intro のときだけ、ログイン中でもランディングを表示する（紹介プレビュー）。
  // 送り手の「自分が見られないものは紹介できない」を解消する導線（CONTEXT.md「紹介」）。
  // 友だちが実際に見るのはログアウト時の `/` と同一描画なので、これで確認を兼ねる。
  validateSearch: (search: Record<string, unknown>): { intro?: boolean } => ({
    intro:
      search.intro === true || search.intro === '1' || search.intro === 'true'
        ? true
        : undefined,
  }),
  loaderDeps: ({ search }) => ({ intro: search.intro }),
  loader: async ({ deps }) => {
    const shell = await fetchShell();
    // 通常は既定タブ /me へ（ADR-0008）。ただし紹介プレビュー(?intro)は素通しする。
    if (shell.status === 'ok' && !deps.intro) throw redirect({ to: '/me' });
    return shell;
  },
  component: Home,
});

function Home() {
  const data = Route.useLoaderData();
  const { intro } = Route.useSearch();
  if (data.status === 'unconfigured')
    return <SetupNotice message={data.message} />;
  return <Landing intro={intro} />;
}

const page: CSSProperties = {
  background: 'var(--bg)',
  minHeight: '100vh',
  fontFamily: 'var(--font-jp)',
  display: 'grid',
  placeItems: 'center',
  padding: 24,
};

const card: CSSProperties = {
  background: 'var(--surface)',
  borderRadius: 20,
  padding: '32px 28px',
  maxWidth: 380,
  width: '100%',
  boxShadow: '0 8px 32px rgb(0 0 0 / 0.08)',
  textAlign: 'center',
};

function SetupNotice({ message }: { message: string }) {
  return (
    <div style={page}>
      <div style={card}>
        <h1 style={{ fontSize: 18, color: 'var(--ink)', marginBottom: 12 }}>
          サーバーが未設定です
        </h1>
        <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.8 }}>
          {message}
        </p>
        <p style={{ marginTop: 20, fontSize: 13 }}>
          <Link to="/preview" style={{ color: 'var(--accent)' }}>
            設定なしでデモ画面を見る →
          </Link>
        </p>
      </div>
    </div>
  );
}

/**
 * 未ログインのランディング（ADR-0008 §7・§実装決定4）。
 * デザインは既存モックアップの LP 部を移植。実画面のショーケースは重複を作らず、
 * ライブで操作できる /preview へ「引用」リンクする。
 *   - ブランド銘板は素名「アサトモ」（家族名・ハブそのものを出す場。CONTEXT.md）。
 *   - 「最後の伝言」表記（旧「最後のメッセージ」から統一。ADR-0008）。
 *   - CTA はログイン（/login。Google ログイン稼働中）＋画面プレビュー（/preview）。
 * スタイルは watch.css の夜明けトークンを使い、LP 固有分だけ .landing 配下にスコープする。
 */
const lpCss = `
.landing{background:var(--bg);color:var(--ink);font-family:var(--font-jp);line-height:1.7;-webkit-font-smoothing:antialiased;min-height:100vh;padding:0 20px 72px}
.landing .wrap{max-width:1000px;margin:0 auto}
.landing .masthead{position:relative;text-align:center;padding:80px 20px 52px;overflow:hidden}
.landing .masthead::before{content:"";position:absolute;inset:-40% 0 auto 0;height:320px;background:radial-gradient(60% 80% at 50% 0%,color-mix(in oklab,var(--accent) 30%,transparent),transparent 70%);pointer-events:none}
.landing .brandrow{position:relative;display:inline-flex;align-items:center;gap:12px;margin-bottom:26px}
.landing .brandicon{width:32px;height:32px;border-radius:9px;display:block;box-shadow:var(--shadow-sm)}
.landing .wordmark{font-size:22px;font-weight:700;letter-spacing:.18em;padding-left:.18em}
.landing .tagline{position:relative;font-size:clamp(26px,4.6vw,42px);font-weight:700;line-height:1.35;letter-spacing:.01em;text-wrap:balance;margin:0 auto;max-width:18em}
.landing .subline{position:relative;color:var(--ink-2);max-width:34em;margin:20px auto 0;font-size:16px}
.landing .lp{padding:8px 0 8px}
.landing .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin:24px 0 34px}
.landing .step{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:24px 22px;box-shadow:var(--shadow-sm);position:relative}
.landing .step .num{position:absolute;top:20px;right:22px;font-size:13px;font-weight:700;color:var(--accent);background:var(--accent-soft);width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-variant-numeric:tabular-nums}
.landing .step .ico{font-size:30px;margin-bottom:12px}
.landing .step h3{margin:0 0 8px;font-size:17px}
.landing .step p{margin:0;color:var(--ink-2);font-size:14px}
.landing .stepnote{text-align:center;color:var(--ink-3);font-size:12.5px;line-height:1.7;max-width:40em;margin:0 auto 6px}
.landing .relrow{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px 10px;max-width:46em;margin:-14px auto 20px}
.landing .relrow .chip{display:inline-flex;align-items:center;gap:6px;background:var(--surface-2);border:1px solid var(--line);border-radius:999px;padding:6px 13px;font-size:12.5px;color:var(--ink-2)}
.landing .relrow .chip b{color:var(--ink);font-weight:600}
.landing .relrow .arrow{color:var(--accent);font-weight:700}
.landing .assur{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin:22px 0 8px}
.landing .assur-item{padding:16px 4px 6px;border-top:2px solid var(--accent)}
.landing .assur-item h4{margin:0 0 6px;font-size:15.5px}
.landing .assur-item p{margin:0;color:var(--ink-2);font-size:13.5px}
.landing .legacy-note{text-align:center;margin:36px auto 0;color:var(--ink-2);font-size:15px;padding:22px 28px;background:var(--surface-2);border-radius:18px;text-wrap:balance}
.landing .cta{text-align:center;margin:40px 0 6px;display:flex;flex-direction:column;align-items:center;gap:14px}
.landing .btn{appearance:none;border:0;font-family:inherit;cursor:pointer;font-size:15px;font-weight:600;border-radius:13px;padding:14px 40px;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;width:auto;max-width:100%}
.landing .btn.primary{background:var(--accent);color:#fff;min-width:240px}
.landing .prevlink{color:var(--accent);font-size:13.5px;text-decoration:none}
.landing footer{text-align:center;color:var(--ink-3);font-size:12.5px;padding:44px 20px 0;margin-top:32px;border-top:1px solid var(--line)}
@media (max-width:720px){.landing .steps,.landing .assur{grid-template-columns:1fr}}
@media (prefers-reduced-motion:no-preference){.landing .btn{transition:transform .12s ease}.landing .btn:hover{transform:translateY(-1px)}}
`;

/**
 * 紹介プレビュー時（?intro）だけランディング最上部に出す帯。
 *   - 「戻る」で送り手（多くはログイン中）が自分の画面 /me へ戻れる。
 *   - 「友だちに送る」は共有シート（navigator.share）。素のドメイン `/` を送るので
 *     受け手は未ログインのままランディングを読める（CONTEXT.md「紹介」）。
 *     共有シート非対応（PC ブラウザ等）ではクリップボードへフォールバック。
 *   - 招待トークンの再共有を絞る ADR-0005 とは対象が別（こちらは公開＝拡散前提のURL）。
 */
function IntroBar() {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = `${window.location.origin}/`;
    // 「アサトモ」は傘ブランド／ハブなので「アプリ」と呼ばない（CONTEXT.md：素の
    // 「アプリ」はスマホ目覚ましを指す）。ここでは「サービス」と明示する。
    const message = `朝の「今日も元気」をそっと見守り合うサービス「アサトモ」。\n下記のリンクで詳細をご確認のうえ、ぜひご参加ください。\n\n${url}`;
    try {
      // text と url を分けて渡すと、共有先（LINE 等）が text を捨てて url だけ
      // 拾うことがある。文面＋URL を1つの text にまとめ、確実に文面を届ける。
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ text: message });
      } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(message);
        setCopied(true);
      }
    } catch {
      // 共有シートのキャンセル・失敗は無視（ユーザー操作の取消を含む）。
    }
  }

  return (
    <>
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 30,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '10px 16px',
          background: 'var(--surface)',
          borderBottom: '1px solid var(--line)',
          fontFamily: 'var(--font-jp)',
        }}
      >
        <Link
          to="/me"
          style={{
            fontSize: 13,
            color: 'var(--ink-2)',
            textDecoration: 'none',
          }}
        >
          ← 自分の画面に戻る
        </Link>
        <button
          type="button"
          onClick={share}
          style={{
            appearance: 'none',
            border: 0,
            cursor: 'pointer',
            padding: '8px 16px',
            borderRadius: 10,
            fontWeight: 600,
            fontSize: 13,
            background: 'var(--accent)',
            color: '#fff',
          }}
        >
          {copied ? 'コピーしました ✓' : '友だちに送る'}
        </button>
      </div>
      <p
        style={{
          margin: 0,
          padding: '6px 16px',
          fontSize: 12,
          color: 'var(--ink-3)',
          textAlign: 'center',
          background: 'var(--surface-2)',
          fontFamily: 'var(--font-jp)',
        }}
      >
        これは友だちに見える紹介ページです。
      </p>
    </>
  );
}

function Landing({ intro }: { intro?: boolean }) {
  return (
    <>
      {intro ? <IntroBar /> : null}
      <div className="landing">
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: LP固有CSSをスコープ注入 */}
        <style dangerouslySetInnerHTML={{ __html: lpCss }} />
        <div className="wrap">
          <header className="masthead">
            <div className="brandrow">
              <img
                src="/apple-touch-icon.png"
                alt=""
                aria-hidden
                width={32}
                height={32}
                className="brandicon"
              />
              <span className="wordmark">アサトモ</span>
            </div>
            <h1 className="tagline">
              目覚ましを止めるだけで、大切な人に「今日も元気」が伝わる。
            </h1>
            <p className="subline">
              一人暮らしの朝を、誰かがゆるく知ってる安心。見張るのではなく、そっと寄り添う設計です。
            </p>
          </header>

          <section className="lp">
            <div className="steps">
              <div className="step">
                <div className="num">1</div>
                <div className="ico" aria-hidden>
                  ⏰
                </div>
                <h3>朝、アラームを止める</h3>
                <p>
                  いつもの目覚まし。止めるだけで、それが「無事」のサインになります。
                </p>
              </div>
              <div className="step">
                <div className="num">2</div>
                <div className="ico" aria-hidden>
                  🌤️
                </div>
                <h3>そっと、伝わる</h3>
                <p>
                  見守ってくれる人に「今日も元気そう」が届く。居場所ではなく、近況だけ。
                </p>
              </div>
              <div className="step">
                <div className="num">3</div>
                <div className="ico" aria-hidden>
                  🕊️
                </div>
                <h3>もしもの時だけ</h3>
                <p>
                  人の判断を経て、大切な人へ用意した言葉が届きます。急がず、慎重に。
                </p>
              </div>
            </div>

            <p className="relrow">
              <span className="chip">
                🔔 <b>アサトモ目覚まし</b>（Android・毎朝の道具）
              </span>
              <span className="arrow" aria-hidden>
                →
              </span>
              <span className="chip">
                🌤️ <b>アサトモWeb</b>（見守り・伝言の本体／元気も伝わります）
              </span>
            </p>

            <p className="stepnote">
              「アサトモ目覚まし」はAndroid版のみです。iPhoneの方は「アサトモWeb」で、見守りも、ご自身の元気を届けることもできます。
            </p>

            <div className="assur">
              <div className="assur-item">
                <h4>見張らない</h4>
                <p>
                  本人の画面はただの目覚まし時計。監視されている感覚を残しません。
                </p>
              </div>
              <div className="assur-item">
                <h4>誤爆しない</h4>
                <p>
                  純粋なタイマーではなく、人の判断を介在。複数人の合意・猶予期間・本人の取消で守ります。
                </p>
              </div>
              <div className="assur-item">
                <h4>静かに、長く</h4>
                <p>
                  依存を最小に、無料枠で。「静かに動き続けること」そのものを大切にします。
                </p>
              </div>
            </div>

            <p className="legacy-note">
              そして——もしもの時には、あなたが遺した「最後の伝言」を、大切な人へ。本文は運営者にも読めないよう暗号化されます。
            </p>

            <div className="cta">
              <Link to="/login" className="btn primary">
                はじめる
              </Link>
              <Link to="/preview" className="prevlink">
                ログインせずにデモ画面を見る →
              </Link>
            </div>
          </section>

          <footer>
            <p style={{ margin: '0 0 8px' }}>
              <Link to="/privacy" className="prevlink">
                プライバシーポリシー
              </Link>
              <span style={{ margin: '0 8px', color: 'var(--ink-3)' }}>·</span>
              <Link to="/terms" className="prevlink">
                利用規約
              </Link>
            </p>
            アサトモ · 一人暮らしの朝に、そっと寄り添う見守り
          </footer>
        </div>
      </div>
    </>
  );
}
