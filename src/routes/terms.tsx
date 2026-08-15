import { createFileRoute, Link } from '@tanstack/react-router';

/**
 * 利用規約（/terms）。ログイン不要の静的ページ。
 * アサトモ固有の重要免責を明記する: 緊急通報・医療・警備サービスの代替ではないこと、
 * 通知は best-effort で保証しないこと、最後の伝言は遺言ではないこと、合言葉を失うと復元不能。
 */
export const Route = createFileRoute('/terms')({
  component: TermsPage,
});

const ESTABLISHED = '2026年7月25日';

// 外枠は旧 content-box 実測（maxWidth640 + 左右padding24×2 = 688px）＝max-w-172。
const sheetCls =
  'w-full max-w-172 rounded-[20px] bg-card px-6 py-8 shadow-[0_8px_32px_rgb(0_0_0/0.06)]';
const h2Cls =
  'mb-3 border-b border-border pb-1.5 text-base font-semibold text-foreground';
const bodyCls = 'text-[13.5px] leading-[1.9] text-muted-foreground';

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-7.5">
      <h2 className={h2Cls}>{title}</h2>
      <div className={bodyCls}>{children}</div>
    </section>
  );
}

function TermsPage() {
  return (
    <div className="flex min-h-screen justify-center bg-background px-4 pt-10 pb-16">
      <div className={sheetCls}>
        <div className="mb-7">
          <Link to="/" className="text-xs text-primary hover:underline">
            ← トップに戻る
          </Link>
          <h1 className="mt-4 mb-1 text-[22px] font-bold text-foreground">
            利用規約
          </h1>
          <p className="m-0 text-xs text-(--ink-3)">制定: {ESTABLISHED}</p>
        </div>

        <Section title="第1条（適用）">
          <p>
            本規約は、ピータン（以下「運営者」）が提供するサービス「アサトモ」（以下「本サービス」）の利用条件を定めるものです。ユーザーは、本サービスにログインまたは本サービスを利用することにより、本規約および
            <Link to="/privacy" className="text-primary hover:underline">
              プライバシーポリシー
            </Link>
            に同意したものとみなします。
          </p>
        </Section>

        <Section title="第2条（利用資格）">
          <p>
            本サービスは18歳以上の方を対象としています。18歳未満の方はご利用いただけません。
          </p>
        </Section>

        <Section title="第3条（本サービスの性質・重要な免責）">
          <p>
            本サービスは、ゆるやかな見守りを支援する道具です。以下の点に必ずご同意のうえご利用ください。
          </p>
          <ul className="mt-2 list-disc pl-5">
            <li>
              本サービスは
              <strong className="text-foreground">
                緊急通報・救急・医療・介護・警備のサービスではなく、これらの代替にもなりません
              </strong>
              。生命・身体の危険が疑われる場合は、消防（119）・警察（110）その他の公的機関へご連絡ください
            </li>
            <li>
              本サービスは、ご本人の安否や生存、異常の発生を
              <strong className="text-foreground">
                検知・保証するものではありません
              </strong>
              。通知は最善の努力で行いますが、通信環境・端末の状態・第三者サービスの障害等により、
              <strong className="text-foreground">
                遅延・不達となる場合があります
              </strong>
            </li>
            <li>
              死亡認定は見守り者による人間の判断に基づくものであり、誤りうるものです。本サービスはその判断の正確性を保証しません
            </li>
            <li>
              見守り者・受取人としての協力は善意の任意によるものであり、本サービスは、ユーザーに対して他者を監護・救助する法的義務を生じさせるものではありません
            </li>
          </ul>
        </Section>

        <Section title="第4条（最後の伝言について）">
          <ul className="list-disc pl-5">
            <li>
              「最後の伝言」は想いを託すためのメッセージであり、
              <strong className="text-foreground">
                法的な遺言ではありません
              </strong>
              。財産の処分その他の法的効力を持ちません
            </li>
            <li>
              本文は運営者も読めない形で暗号化されます。復号のための合言葉・編集用パスワードを失った場合、
              <strong className="text-foreground">
                運営者を含め誰も内容を復元できません
              </strong>
            </li>
            <li>
              口座番号・暗証番号・その他の重要な秘密は記載しないでください
            </li>
          </ul>
        </Section>

        <Section title="第5条（アカウント）">
          <p>
            ユーザーは、自己の責任においてアカウントを管理するものとします。第三者によるアカウントの不正利用により生じた損害について、運営者は責任を負いません。
          </p>
          <p className="mt-2">
            ユーザーはいつでも退会できます。退会時のデータの取り扱いは
            <Link to="/privacy" className="text-primary hover:underline">
              プライバシーポリシー
            </Link>
            に定めるとおり、即時・完全な削除となります。
          </p>
        </Section>

        <Section title="第6条（禁止事項）">
          <p>
            ユーザーは、本サービスの利用にあたり、以下の行為をしてはなりません。
          </p>
          <ul className="mt-2 list-disc pl-5">
            <li>法令または公序良俗に違反する行為</li>
            <li>他者（実在の人物・団体）と誤認させる行為</li>
            <li>
              本人の同意なく他者を見守り対象とし、または監視する目的で本サービスを利用する行為
            </li>
            <li>
              他者の知的財産権・肖像権・プライバシーその他の権利を侵害する行為
            </li>
            <li>
              スパム、無差別な勧誘など社会通念上迷惑と判断される行為（招待リンク・QRコードの濫用を含む）
            </li>
            <li>
              虚偽の生存シグナルや虚偽の死亡認定など、本サービスの信頼性を損なう行為
            </li>
            <li>
              不正アクセス、過度な負荷をかける行為、その他本サービスの運営を妨害する行為
            </li>
            <li>その他、運営者が不適切と判断する行為</li>
          </ul>
        </Section>

        <Section title="第7条（コンテンツの権利）">
          <p>
            ユーザーが本サービスに入力した文章等（以下「ユーザーコンテンツ」）の著作権はユーザーに帰属します。ユーザーは運営者に対し、本サービスの提供・維持・改善に必要な範囲でユーザーコンテンツを複製・表示・送信することを無償で許諾するものとします。運営者はこの範囲を超えて、ユーザーコンテンツを宣伝等の目的で利用することはありません。
          </p>
        </Section>

        <Section title="第8条（違反への対応）">
          <p>
            ユーザーが本規約に違反した場合またはそのおそれがあると運営者が判断した場合、運営者は事前の通知なく、ユーザーコンテンツの削除、本サービスの利用停止、アカウントの削除を行うことができます。運営者は、これらの措置の理由を開示する義務を負いません。削除されたデータは復元できません。
          </p>
        </Section>

        <Section title="第9条（サービスの変更・終了）">
          <p>
            運営者は、事前の予告なく本サービスの内容の変更・機能の追加や廃止・一時的な中断を行うことができます。本サービス全体を終了する場合は、30日前までに本サービス内で告知します。ただし、法令への対応、システム上の重大な障害その他やむを得ない事情がある場合はこの限りではありません。
          </p>
        </Section>

        <Section title="第10条（料金）">
          <p>
            本サービスは現在無料で提供しています。将来、有料の機能を導入する場合は、内容と条件を別途定め、事前に告知します。
          </p>
        </Section>

        <Section title="第11条（免責）">
          <p>
            本サービスは現状有姿で提供され、運営者はその完全性・正確性・有用性・特定目的への適合性を保証しません。
          </p>
          <p className="mt-2">
            運営者は、本サービスの中断・停止・終了、通知の遅延・不達、データの消失、不具合、死亡認定や近況表示の誤り等によりユーザーまたは第三者に生じた損害について、運営者に故意または重大な過失がある場合を除き、責任を負いません。運営者が責任を負う場合であっても、その範囲は現実に生じた直接かつ通常の損害に限られます。
          </p>
          <p className="mt-2">
            ユーザー間またはユーザーと第三者との間で生じたトラブルについて、運営者は関与せず、責任を負いません。
          </p>
        </Section>

        <Section title="第12条（反社会的勢力の排除）">
          <p>
            ユーザーは、自らが暴力団、暴力団員その他の反社会的勢力に該当しないこと、および反社会的勢力と関係を有しないことを表明し、保証するものとします。
          </p>
        </Section>

        <Section title="第13条（規約の改定）">
          <p>
            運営者は、必要に応じて本規約を改定することがあります。改定する場合は、効力発生日を定め、本サービス内で周知します。効力発生日以降に本サービスを利用した場合、改定後の規約に同意したものとみなします。
          </p>
        </Section>

        <Section title="第14条（分離可能性）">
          <p>
            本規約のいずれかの条項が無効または執行不能と判断された場合であっても、その他の条項は継続して完全に効力を有するものとします。
          </p>
        </Section>

        <Section title="第15条（準拠法・管轄）">
          <p>
            本規約の準拠法は日本法とします。本サービスに関して紛争が生じた場合、運営者の所在地を管轄する裁判所を第一審の専属的合意管轄裁判所とします。
          </p>
        </Section>

        <Section title="お問い合わせ">
          <p>
            本規約に関するご質問は下記までお問い合わせください。
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
