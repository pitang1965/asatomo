import { createFileRoute, Link } from '@tanstack/react-router';
import type { CSSProperties } from 'react';

/**
 * プライバシーポリシー（/privacy）。ログイン不要の静的ページ。
 * アサトモ固有の機微情報（生存シグナル・近況・E2E暗号化された最後の伝言）を正確に記す。
 * なふだの privacy を下敷きにしつつ、GPS非取得・第三者はGoogle/Neon/Cloudflare/Resendに差し替え。
 */
export const Route = createFileRoute('/privacy')({
  component: PrivacyPage,
});

const UPDATED = '2026年7月25日';

const page: CSSProperties = {
  background: 'var(--bg)',
  minHeight: '100vh',
  fontFamily: 'var(--font-jp)',
  display: 'flex',
  justifyContent: 'center',
  padding: '40px 16px 64px',
};

const sheet: CSSProperties = {
  width: '100%',
  maxWidth: 640,
  background: 'var(--surface)',
  borderRadius: 20,
  padding: '32px 24px',
  boxShadow: '0 8px 32px rgb(0 0 0 / 0.06)',
};

const h2: CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  color: 'var(--ink)',
  margin: '0 0 12px',
  paddingBottom: 6,
  borderBottom: '1px solid var(--line)',
};

const body: CSSProperties = {
  fontSize: 13.5,
  color: 'var(--ink-2)',
  lineHeight: 1.9,
};

const linkStyle: CSSProperties = { color: 'var(--accent)' };

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 30 }}>
      <h2 style={h2}>{title}</h2>
      <div style={body}>{children}</div>
    </section>
  );
}

function PrivacyPage() {
  return (
    <div style={page}>
      <div style={sheet}>
        <div style={{ marginBottom: 28 }}>
          <Link to="/" style={{ ...linkStyle, fontSize: 12 }}>
            ← トップに戻る
          </Link>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: 'var(--ink)',
              margin: '16px 0 4px',
            }}
          >
            プライバシーポリシー
          </h1>
          <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: 0 }}>
            最終更新: {UPDATED}
          </p>
        </div>

        <Section title="1. 運営者">
          <p style={{ margin: 0 }}>
            屋号・名称: ピータン
            <br />
            お問い合わせ:{' '}
            <a href="mailto:info@nafuda.me" style={linkStyle}>
              info@nafuda.me
            </a>
          </p>
          <p style={{ margin: '8px 0 0' }}>
            本サービス「アサトモ」（以下「本サービス」）の利用条件は
            <Link to="/terms" style={linkStyle}>
              利用規約
            </Link>
            に定めています。
          </p>
        </Section>

        <Section title="2. 収集する情報">
          <p style={{ margin: 0 }}>本サービスでは以下の情報を扱います。</p>
          <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
            <li>
              <strong style={{ color: 'var(--ink)' }}>アカウント情報</strong>
              ：Googleでのログイン時に取得する氏名・メールアドレス・プロフィール画像
            </li>
            <li>
              <strong style={{ color: 'var(--ink)' }}>
                見守り・つながりの情報
              </strong>
              ：誰と見守り合うか（招待・つながり）、見守り者や最後の伝言の宛先（受取人）の指定、見守り解除・アカウント削除の記録
            </li>
            <li>
              <strong style={{ color: 'var(--ink)' }}>
                生存シグナル・近況
              </strong>
              ：「ごはん」「おやすみ」「いってきます」「ただいま」などの申告、アプリの起動・Webチェックイン・アラームの停止といった操作の記録、および「最後に生存を示した時刻」。
              <strong style={{ color: 'var(--ink)' }}>
                位置情報（GPS）は取得しません
              </strong>
              （「いってきます」等はボタン操作の申告であり、居場所の測定ではありません）
            </li>
            <li>
              <strong style={{ color: 'var(--ink)' }}>最後の伝言</strong>
              ：ご本人が用意する、もしもの時に届くメッセージ。
              <strong style={{ color: 'var(--ink)' }}>
                本文は端末側で暗号化してから保存し、運営者は復号鍵を持たないため平文を読めません
              </strong>
              （ゼロ知識）。復号のための合言葉・編集用パスワードはサーバーに保存しません
            </li>
            <li>
              <strong style={{ color: 'var(--ink)' }}>死亡認定の記録</strong>
              ：見守り者による確認・投票、代理確認の「誰が・いつ」の記録（安全網の透明性のため）
            </li>
            <li>
              <strong style={{ color: 'var(--ink)' }}>セッション情報</strong>
              ：ログイン時のIPアドレス・ブラウザのUser-Agent（不正アクセス検知のため）
            </li>
          </ul>
          <p style={{ margin: '12px 0 0' }}>
            アカウント情報は退会まで保管し、退会時に削除します（下記「7.
            ユーザーの権利」）。
          </p>
        </Section>

        <Section title="3. 利用目的">
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>アカウント認証・本人確認</li>
            <li>見守り関係（招待・つながり・見守り合い）の提供</li>
            <li>生存シグナルの記録と、見守ってくれる人への近況の共有</li>
            <li>
              異常の可能性がある場合の見守り者への連絡（メール）、および死亡認定・最後の伝言の開示プロセスの実行
            </li>
            <li>サービスの改善・不具合調査</li>
            <li>不正利用の検知・防止</li>
          </ul>
        </Section>

        <Section title="4. 近況として見守り者に見える範囲">
          <p style={{ margin: 0 }}>
            見守ってくれる人に見えるのは、
            <strong style={{ color: 'var(--ink)' }}>
              「最後にいつ元気だったか」を過去形・おおまかな経過時間で示した近況
            </strong>
            のみです（例:「約2時間前に食事をしました」）。リアルタイムの居場所や「今何をしているか」は共有しません。留守を推測させる申告（「いってきます」等）は、ぼかした表現で表示します。何が記録され、どう伝わるかは、ご本人の記録画面でいつでも確認できます。
          </p>
        </Section>

        <Section title="5. 第三者サービスへのデータ提供">
          <p style={{ margin: 0 }}>
            本サービスは以下の第三者サービスを利用しており、必要な範囲でデータが処理されます。いずれも法令に基づく場合を除き、第三者への売却・目的外提供は行いません。
          </p>
          <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
            <div>
              <p style={{ margin: 0, color: 'var(--ink)', fontWeight: 600 }}>
                Google（米国）
              </p>
              <p style={{ margin: 0 }}>
                Googleアカウントによるログイン機能を提供します。詳細:{' '}
                <a
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={linkStyle}
                >
                  policies.google.com/privacy
                </a>
              </p>
            </div>
            <div>
              <p style={{ margin: 0, color: 'var(--ink)', fontWeight: 600 }}>
                Resend（米国）
              </p>
              <p style={{ margin: 0 }}>
                見守り者への通知メール等の配信を担います。送信先メールアドレスと本文（近況の要約・招待・開示の案内等）が経由します。
              </p>
            </div>
            <div>
              <p style={{ margin: 0, color: 'var(--ink)', fontWeight: 600 }}>
                Neon（米国）
              </p>
              <p style={{ margin: 0 }}>
                アカウント情報・見守り関係・生存シグナル・暗号化された最後の伝言などを保管するデータベースサービスです。
              </p>
            </div>
            <div>
              <p style={{ margin: 0, color: 'var(--ink)', fontWeight: 600 }}>
                Cloudflare（米国）
              </p>
              <p style={{ margin: 0 }}>
                サービスのホスティング・配信を担います。
              </p>
            </div>
            <div>
              <p style={{ margin: 0, color: 'var(--ink)', fontWeight: 600 }}>
                Firebase Cloud Messaging / Google（米国）
              </p>
              <p style={{ margin: 0 }}>
                Android版アプリでプッシュ通知を利用する場合に、通知の配信を担います。
              </p>
            </div>
          </div>
        </Section>

        <Section title="6. Cookie およびローカルストレージの利用">
          <p style={{ margin: 0 }}>
            本サービスはログイン状態の維持のためにCookieを使用します。また、Webチェックインの送信間隔の管理などのために、ブラウザのローカルストレージを使用します。ブラウザの設定でこれらを無効化できますが、ログイン機能などが利用できなくなる場合があります。
          </p>
        </Section>

        <Section title="7. データの保管・セキュリティ">
          <p style={{ margin: 0 }}>
            収集したデータは米国のNeonデータベースに保管されます。通信はTLS（HTTPS）で暗号化し、セッショントークンは署名付きCookieで管理しています。最後の伝言の本文は、開示条件が成立するまで運営者も読めない形で暗号化して保管します。ただし、インターネット上の通信において完全な安全性を保証することはできません。
          </p>
        </Section>

        <Section title="8. ユーザーの権利">
          <p style={{ margin: 0 }}>ユーザーはいつでも以下の操作を行えます。</p>
          <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
            <li>ご自身の記録・見守り関係・最後の伝言の閲覧・編集・削除</li>
            <li>
              退会（アカウント削除）:
              アカウント・見守り関係・生存シグナルの記録・最後の伝言・死亡認定に残る投票等を
              <strong style={{ color: 'var(--ink)' }}>即時・完全に削除</strong>
              します（復元できません）。あなたが見守っていた人には「見守りをやめた／利用をやめた」旨が穏当に通知され、削除前に依存者ごとの影響を確認できます
            </li>
          </ul>
          <p style={{ margin: '8px 0 0' }}>
            退会手順:
            ログイン後、「アカウント」→「アカウントを削除する」から行えます。個人情報の開示・訂正・利用停止等のご請求は、下記お問い合わせ先までご連絡ください。
          </p>
        </Section>

        <Section title="9. 未成年の利用">
          <p style={{ margin: 0 }}>
            本サービスは13歳以上の方を対象としています（
            <Link to="/terms" style={linkStyle}>
              利用規約
            </Link>
            第2条）。
          </p>
        </Section>

        <Section title="10. プライバシーポリシーの改定">
          <p style={{ margin: 0 }}>
            本ポリシーは必要に応じて改定することがあります。重要な変更がある場合はサービス内でお知らせします。変更後も引き続きご利用いただいた場合、改定後のポリシーに同意したものとみなします。
          </p>
        </Section>

        <Section title="11. お問い合わせ">
          <p style={{ margin: 0 }}>
            個人情報の取り扱いに関するご質問・ご要望は下記までお問い合わせください。
            <br />
            <a href="mailto:info@nafuda.me" style={linkStyle}>
              info@nafuda.me
            </a>
          </p>
        </Section>

        <div
          style={{
            marginTop: 8,
            paddingTop: 20,
            borderTop: '1px solid var(--line)',
            textAlign: 'center',
          }}
        >
          <Link
            to="/"
            style={{
              ...linkStyle,
              fontSize: 14,
              display: 'inline-block',
              padding: '10px 16px',
            }}
          >
            ← トップに戻る
          </Link>
        </div>
      </div>
    </div>
  );
}
