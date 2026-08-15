import { createFileRoute, Link } from '@tanstack/react-router';

/**
 * ベータ参加案内（/beta）。ログイン不要の公開ページ。
 * Google Play のクローズドテスト（製品版公開の前提＝12人以上×14日連続オプトイン）へ
 * テスターを迎えるための導線。登録方式は Google グループ（車旅のしおりと同じ運用）。
 *
 * 参加は3ステップ:
 *   ① Google グループに参加（＝テスターとして認識される前提条件）
 *   ② Play の「テスターになる」オプトインリンクを開く
 *   ③ Google Play からインストール
 *
 * リンクは差し替えやすいよう定数化。オプトイン/ストアURLは package 名から確定。
 * Google グループURLはグループ作成後に差し込む（TODO）。
 */
export const Route = createFileRoute('/beta')({
  // ベータ募集ページはSNSで共有して人を集めるのが目的。__root の共通OGP（トップ用）を、
  // 同じ property/name キーで上書きしてこのページ専用にする（SSRで初期HTMLに乗りクローラに届く）。
  // og:image は共通 ogp.png を流用するため、あえて再指定しない。
  head: () => ({
    meta: [
      { title: 'アサトモ Android ベータテスター募集' },
      {
        name: 'description',
        content:
          '目覚ましを止めるだけで、大切な人に「今日も元気」が伝わる見守りアプリ「アサトモ」。公開前のテスターを募集しています。',
      },
      { property: 'og:url', content: 'https://asatomo.nafuda.me/beta' },
      {
        property: 'og:title',
        content: 'アサトモ Android ベータテスター募集',
      },
      {
        property: 'og:description',
        content:
          '目覚ましを止めるだけで、大切な人に「今日も元気」が伝わる見守りアプリ。公開前のテスターを募集中です。',
      },
      {
        name: 'twitter:title',
        content: 'アサトモ Android ベータテスター募集',
      },
      {
        name: 'twitter:description',
        content:
          '目覚ましを止めるだけで、大切な人に「今日も元気」が伝わる見守りアプリ。公開前のテスターを募集中です。',
      },
    ],
  }),
  component: BetaPage,
});

// --- 差し替えポイント -------------------------------------------------------
// クローズドテスト用の参加者 Google グループ（2026-08-14 作成・確定）。
// asatomo-testers@googlegroups.com / 「誰でも参加できる」設定。
const GROUP_URL = 'https://groups.google.com/g/asatomo-testers';
// クローズドテストのオプトイン（Web）URL。package 名から確定。
const OPT_IN_URL = 'https://play.google.com/apps/testing/com.asatomo.app';
// ストア掲載URL。package 名から確定（公開前はテスター限定で開ける）。
const STORE_URL =
  'https://play.google.com/store/apps/details?id=com.asatomo.app';
// ----------------------------------------------------------------------------

const betaCss = `
.beta{background:var(--bg);color:var(--ink);font-family:var(--font-jp);line-height:1.7;-webkit-font-smoothing:antialiased;min-height:100vh;padding:0 20px 72px}
.beta .wrap{max-width:760px;margin:0 auto}
.beta .masthead{position:relative;text-align:center;padding:64px 16px 40px;overflow:hidden}
.beta .masthead::before{content:"";position:absolute;inset:-40% 0 auto 0;height:280px;background:radial-gradient(60% 80% at 50% 0%,color-mix(in oklab,var(--accent) 30%,transparent),transparent 70%);pointer-events:none}
.beta .brandrow{position:relative;display:inline-flex;align-items:center;gap:12px;margin-bottom:22px}
.beta .brandicon{width:32px;height:32px;border-radius:9px;display:block;box-shadow:var(--shadow-sm)}
.beta .wordmark{font-size:22px;font-weight:700;letter-spacing:.18em;padding-left:.18em}
.beta .badge{position:relative;display:inline-block;font-size:12.5px;font-weight:700;color:var(--accent);background:var(--accent-soft);border-radius:999px;padding:5px 14px;margin-bottom:16px}
.beta .tagline{position:relative;font-size:clamp(24px,4.4vw,36px);font-weight:700;line-height:1.35;letter-spacing:.01em;text-wrap:balance;margin:0 auto;max-width:16em}
.beta .subline{position:relative;color:var(--ink-2);max-width:32em;margin:18px auto 0;font-size:15.5px}
.beta .lead{background:var(--surface-2);border-radius:18px;padding:20px 24px;margin:8px auto 34px;color:var(--ink-2);font-size:14.5px;text-wrap:balance;text-align:center}
.beta .lead b{color:var(--ink);font-weight:600}
.beta .steps{display:grid;gap:16px;margin:0 0 28px}
.beta .step{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:22px 22px 24px;box-shadow:var(--shadow-sm);position:relative}
.beta .step .num{position:absolute;top:20px;right:22px;font-size:13px;font-weight:700;color:var(--accent);background:var(--accent-soft);width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-variant-numeric:tabular-nums}
.beta .step h3{margin:0 0 8px;font-size:17px;padding-right:34px}
.beta .step p{margin:0 0 14px;color:var(--ink-2);font-size:14px}
.beta .btn{appearance:none;border:0;font-family:inherit;cursor:pointer;font-size:14.5px;font-weight:600;border-radius:12px;padding:12px 26px;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}
.beta .btn.primary{background:var(--accent);color:#fff}
.beta .btn.ghost{background:var(--surface-2);color:var(--ink);border:1px solid var(--line)}
.beta .note{color:var(--ink-3);font-size:12.5px;margin:12px 2px 0}
.beta .ask{border-top:2px solid var(--accent);padding:18px 4px 6px;margin:8px 0 0}
.beta .ask h4{margin:0 0 6px;font-size:15.5px}
.beta .ask p{margin:0;color:var(--ink-2);font-size:13.8px}
.beta footer{text-align:center;color:var(--ink-3);font-size:12.5px;padding:44px 20px 0;margin-top:36px;border-top:1px solid var(--line)}
.beta .prevlink{color:var(--accent);font-size:13.5px;text-decoration:none}
@media (prefers-reduced-motion:no-preference){.beta .btn{transition:transform .12s ease}.beta .btn:hover{transform:translateY(-1px)}}
`;

function BetaPage() {
  return (
    <div className="beta">
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: ベータ案内固有CSSをスコープ注入 */}
      <style dangerouslySetInnerHTML={{ __html: betaCss }} />
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
          <span className="badge">Android ベータテスト参加募集</span>
          <h1 className="tagline">
            「アサトモ目覚まし」を
            <br />
            いちばん最初に使ってみませんか。
          </h1>
          <p className="subline">
            朝、目覚ましを止めるだけで「今日も元気」が大切な人にそっと伝わる——そんな見守り合いのアプリを、公開前に試していただけるテスターを募集しています。
          </p>
        </header>

        <p className="lead">
          アサトモは<b>2人で見守り合う</b>アプリです。ご参加は
          <b>ご友人・きょうだい・親御さんなどと「2人1組」</b>
          だと、実際の使い心地までまるごと試せます。
        </p>

        <div className="steps">
          <div className="step">
            <div className="num">1</div>
            <h3>Google グループに参加する</h3>
            <p>
              テスターとして登録するため、まず参加者グループに入ります（お使いの
              Google アカウントで参加してください）。承認は不要、参加ボタンだけです。
            </p>
            <a
              href={GROUP_URL}
              target="_blank"
              rel="noreferrer"
              className="btn primary"
            >
              グループに参加する
            </a>
          </div>

          <div className="step">
            <div className="num">2</div>
            <h3>テスターになる（オプトイン）</h3>
            <p>
              下のリンクを、グループに参加したのと同じ Google
              アカウントのスマホで開き、「テスターになる」を押します。反映まで数分〜数時間かかることがあります。
            </p>
            <a
              href={OPT_IN_URL}
              target="_blank"
              rel="noreferrer"
              className="btn primary"
            >
              テストに参加する
            </a>
          </div>

          <div className="step">
            <div className="num">3</div>
            <h3>Google Play からインストール</h3>
            <p>
              オプトインが反映されると、Google Play
              でアプリが見えるようになります。ストアからインストールしてお使いください。
            </p>
            <a
              href={STORE_URL}
              target="_blank"
              rel="noreferrer"
              className="btn ghost"
            >
              Google Play で開く
            </a>
            <p className="note">
              ※「アイテムが見つかりません」と出る場合は、まだオプトインが反映されていません。少し時間をおいて再度お試しください。
            </p>
          </div>
        </div>

        <div className="ask">
          <h4>ひとつだけ、お願い</h4>
          <p>
            正式公開の準備のため、参加後は<b> しばらくアンインストールせずに </b>
            お使いいただけると本当に助かります。合わなければいつでも抜けられます。ご協力ありがとうございます。
          </p>
        </div>

        <footer>
          <p style={{ margin: '0 0 14px' }}>
            不具合・ご感想はこちら →{' '}
            <a href="mailto:asatomo@nafuda.me" className="prevlink">
              asatomo@nafuda.me
            </a>
          </p>
          <p style={{ margin: '0 0 8px' }}>
            <Link to="/" className="prevlink">
              アサトモについて
            </Link>
            <span style={{ margin: '0 8px', color: 'var(--ink-3)' }}>·</span>
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
  );
}
