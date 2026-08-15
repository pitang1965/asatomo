import { createFileRoute, Link } from '@tanstack/react-router';

/**
 * プライバシーポリシー（/privacy）。ログイン不要の静的ページ。
 * アサトモ固有の機微情報（生存シグナル・近況・E2E暗号化された最後の伝言）を正確に記す。
 * なふだの privacy を下敷きにしつつ、GPS非取得・第三者はGoogle/Neon/Cloudflare/Resendに差し替え。
 */
export const Route = createFileRoute('/privacy')({
  component: PrivacyPage,
});

const UPDATED = '2026年8月4日';

// 外枠は旧 content-box 実測（maxWidth640 + 左右padding24×2 = 688px）＝max-w-172。
const sheetCls =
  'w-full max-w-172 rounded-[20px] bg-card px-6 py-8 shadow-[0_8px_32px_rgb(0_0_0/0.06)]';
const h2Cls =
  'mb-3 border-b border-border pb-1.5 text-base font-semibold text-foreground';
const bodyCls = 'text-[13.5px] leading-[1.9] text-muted-foreground';

function Section({
  title,
  children,
  id,
}: {
  title: string;
  children: React.ReactNode;
  /** アンカー用（例: /privacy#deletion で直接この節へ飛べる）。 */
  id?: string;
}) {
  return (
    <section id={id} className="mb-7.5 scroll-mt-4">
      <h2 className={h2Cls}>{title}</h2>
      <div className={bodyCls}>{children}</div>
    </section>
  );
}

function PrivacyPage() {
  return (
    <div className="flex min-h-screen justify-center bg-background px-4 pt-10 pb-16">
      <div className={sheetCls}>
        <div className="mb-7">
          <Link to="/" className="text-xs text-primary hover:underline">
            ← トップに戻る
          </Link>
          <h1 className="mt-4 mb-1 text-[22px] font-bold text-foreground">
            プライバシーポリシー
          </h1>
          <p className="m-0 text-xs text-(--ink-3)">最終更新: {UPDATED}</p>
        </div>

        <Section title="1. 運営者">
          <p>
            屋号・名称: ピータン
            <br />
            お問い合わせ:{' '}
            <a
              href="mailto:info@nafuda.me"
              className="text-primary hover:underline"
            >
              info@nafuda.me
            </a>
          </p>
          <p className="mt-2">
            本サービス「アサトモ」（以下「本サービス」）の利用条件は
            <Link to="/terms" className="text-primary hover:underline">
              利用規約
            </Link>
            に定めています。
          </p>
        </Section>

        <Section title="2. 収集する情報">
          <p>本サービスでは以下の情報を扱います。</p>
          <ul className="mt-2 list-disc pl-5">
            <li>
              <strong className="text-foreground">アカウント情報</strong>
              ：Google・LINE等の外部サービスでのログイン時に取得する氏名・メールアドレス・プロフィール画像
            </li>
            <li>
              <strong className="text-foreground">
                見守り・つながりの情報
              </strong>
              ：誰と見守り合うか（招待・つながり）、見守り者や最後の伝言の宛先（受取人）の指定、見守り解除・アカウント削除の記録
            </li>
            <li>
              <strong className="text-foreground">生存シグナル・近況</strong>
              ：「ごはん」「おやすみ」「いってきます」「ただいま」などの申告、アプリの起動・Webチェックイン・アラームの停止といった操作の記録、および「最後に生存を示した時刻」。
              <strong className="text-foreground">
                位置情報（GPS）は取得しません
              </strong>
              （「いってきます」等はボタン操作の申告であり、居場所の測定ではありません）
            </li>
            <li>
              <strong className="text-foreground">最後の伝言</strong>
              ：ご本人が用意する、もしもの時に届くメッセージ。
              <strong className="text-foreground">
                本文は端末側で暗号化してから保存し、運営者は復号鍵を持たないため平文を読めません
              </strong>
              （ゼロ知識）。復号のための合言葉・編集用パスワードはサーバーに保存しません
            </li>
            <li>
              <strong className="text-foreground">死亡認定の記録</strong>
              ：見守り者による確認・投票、代理確認の「誰が・いつ」の記録（安全網の透明性のため）
            </li>
            <li>
              <strong className="text-foreground">セッション情報</strong>
              ：ログイン時のIPアドレス・ブラウザのUser-Agent（不正アクセス検知のため）
            </li>
            <li>
              <strong className="text-foreground">利用状況の解析情報</strong>
              ：どの画面が見られたか・ボタンの操作といった利用状況、端末・ブラウザの種別（サービス改善のため、解析ツールPostHogを利用）。
              <strong className="text-foreground">
                入力欄に打ち込んだ内容（合言葉・最後の伝言の本文など）や画面の録画は取得しません
              </strong>
            </li>
          </ul>
          <p className="mt-3">
            アカウント情報は退会まで保管し、退会時に削除します（下記「7.
            ユーザーの権利」）。
          </p>
        </Section>

        <Section title="3. 利用目的">
          <ul className="list-disc pl-5">
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
          <p>
            見守ってくれる人に見えるのは、
            <strong className="text-foreground">
              「最後にいつ元気だったか」を過去形・おおまかな経過時間で示した近況
            </strong>
            のみです（例:「約2時間前に食事をしました」）。リアルタイムの居場所や「今何をしているか」は共有しません。留守を推測させる申告（「いってきます」等）は、ぼかした表現で表示します。何が記録され、どう伝わるかは、ご本人の記録画面でいつでも確認できます。
          </p>
        </Section>

        <Section title="5. 第三者サービスへのデータ提供">
          <p>
            本サービスは以下の第三者サービスを利用しており、必要な範囲でデータが処理されます。いずれも法令に基づく場合を除き、第三者への売却・目的外提供は行いません。
          </p>
          <div className="mt-3 grid gap-3">
            <div>
              <p className="font-semibold text-foreground">Google（米国）</p>
              <p>
                Googleアカウントによるログイン機能を提供します。詳細:{' '}
                <a
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  policies.google.com/privacy
                </a>
              </p>
            </div>
            <div>
              <p className="font-semibold text-foreground">Resend（米国）</p>
              <p>
                見守り者への通知メール等の配信を担います。送信先メールアドレスと本文（近況の要約・招待・開示の案内等）が経由します。
              </p>
            </div>
            <div>
              <p className="font-semibold text-foreground">Neon（米国）</p>
              <p>
                アカウント情報・見守り関係・生存シグナル・暗号化された最後の伝言などを保管するデータベースサービスです。
              </p>
            </div>
            <div>
              <p className="font-semibold text-foreground">
                Cloudflare（米国）
              </p>
              <p>サービスのホスティング・配信を担います。</p>
            </div>
            <div>
              <p className="font-semibold text-foreground">
                Firebase Cloud Messaging / Google（米国）
              </p>
              <p>
                Android版アプリでプッシュ通知を利用する場合に、通知の配信を担います。
              </p>
            </div>
            <div>
              <p className="font-semibold text-foreground">PostHog（米国）</p>
              <p>
                サービス改善のための利用状況の解析（どの画面が見られたか・操作・端末やブラウザの種別）を担います。入力内容や画面の録画は送信しません。詳細:{' '}
                <a
                  href="https://posthog.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  posthog.com/privacy
                </a>
              </p>
            </div>
          </div>
        </Section>

        <Section title="6. Cookie およびローカルストレージの利用">
          <p>
            本サービスはログイン状態の維持のためにCookieを使用します。また、Webチェックインの送信間隔の管理や利用状況の解析（PostHog）のために、ブラウザのCookie・ローカルストレージを使用します。ブラウザの設定でこれらを無効化できますが、ログイン機能などが利用できなくなる場合があります。
          </p>
        </Section>

        <Section title="7. データの保管・セキュリティ">
          <p>
            収集したデータは米国のNeonデータベースに保管されます。通信はTLS（HTTPS）で暗号化し、セッショントークンは署名付きCookieで管理しています。最後の伝言の本文は、開示条件が成立するまで運営者も読めない形で暗号化して保管します。ただし、インターネット上の通信において完全な安全性を保証することはできません。
          </p>
        </Section>

        <Section title="8. ユーザーの権利・データの削除方法" id="deletion">
          <p>
            ユーザーはいつでも、ご自身のデータを閲覧・編集・削除できます。
            <strong className="text-foreground">
              アカウントを削除せずに、一部のデータだけを削除すること
            </strong>
            もできます。いずれの操作も、ご本人のアカウントでログインして行います。
          </p>
          <ul className="mt-3 list-disc pl-5">
            <li>
              <strong className="text-foreground">最後の伝言の削除</strong>
              ：ログイン後「伝言」画面を開き、削除したい伝言の「削除」ボタンから、その伝言を個別に削除できます（本文・見出し・宛先ごと消えます）。宛先だけを外したい場合は、伝言を開いて「宛先を編集」から変更できます
            </li>
            <li>
              <strong className="text-foreground">
                つながり・見守り関係の削除
              </strong>
              ：ログイン後「仲間」画面から、対象のつながり（見守り者・見守り相手）を解除・削除できます
            </li>
            <li>
              <strong className="text-foreground">
                アカウントの削除（退会）
              </strong>
              ：ログイン後「アカウント」→「アカウントを削除する」から行えます。アカウント・見守り関係・生存シグナルの記録・最後の伝言・死亡認定に残る投票等を
              <strong className="text-foreground">即時・完全に削除</strong>
              します（復元できません）。あなたが見守っていた人には「見守りをやめた／利用をやめた」旨が穏当に通知され、削除前に依存者ごとの影響を確認できます
            </li>
          </ul>
          <p className="mt-3">
            上記の操作がご自身で行えない場合や、個人情報の開示・訂正・利用停止等のご請求は、下記お問い合わせ先（
            <a
              href="mailto:info@nafuda.me"
              className="text-primary hover:underline"
            >
              info@nafuda.me
            </a>
            ）までご連絡ください。ご本人確認のうえ対応します。
          </p>
        </Section>

        <Section title="9. 未成年の利用">
          <p>
            本サービスは18歳以上の方を対象としています（
            <Link to="/terms" className="text-primary hover:underline">
              利用規約
            </Link>
            第2条）。
          </p>
        </Section>

        <Section title="10. プライバシーポリシーの改定">
          <p>
            本ポリシーは必要に応じて改定することがあります。重要な変更がある場合はサービス内でお知らせします。変更後も引き続きご利用いただいた場合、改定後のポリシーに同意したものとみなします。
          </p>
        </Section>

        <Section title="11. お問い合わせ">
          <p>
            個人情報の取り扱いに関するご質問・ご要望は下記までお問い合わせください。
            <br />
            <a
              href="mailto:info@nafuda.me"
              className="text-primary hover:underline"
            >
              info@nafuda.me
            </a>
          </p>
        </Section>

        <div className="mt-2 border-t border-border pt-5 text-center">
          <Link
            to="/"
            className="inline-block px-4 py-2.5 text-sm text-primary hover:underline"
          >
            ← トップに戻る
          </Link>
        </div>
      </div>
    </div>
  );
}
