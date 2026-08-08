import { createFileRoute, Link } from '@tanstack/react-router';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { fetchMe } from '../server/functions';
import { track } from '../web/analytics';

/**
 * 「わたし」タブ（/me）＝見られる側の全部。既定タブ（ADR-0008 §実装決定3・6）。
 *
 * 並び（決定6）: 様子を伝える → あなたの記録 → 見守ってくれる人（人数＋2人未満警告）→ 誘う。
 * 見守ってくれる人が0人の本人（誰かを見守るためだけに来た人）には様子ブロックと人数を出さず、
 * 勧誘の空状態カードに差し替える。招待CTA はここに一本化する（「仲間」空状態には置かない・決定5）。
 */
export const Route = createFileRoute('/_app/me')({
  loader: () => fetchMe(),
  component: MePage,
});

// コンテンツ幅は全タブ共通の 560（/watch・/messages と一致）。下タブ切り替えで幅が
// ジャンプしないよう、わたし系（/me・/activity・/connections）もこの値に揃える。
// Preflight で box-sizing:border-box のため、px-4（左右16px×2）を足した 592px を外枠に
// 指定して内容幅 560 を保つ（未移行タブの content-box 実測 560+padding と一致）。
const wrap = 'mx-auto max-w-148 px-4 pt-3';

// /me は多数のカードを積むため、既定より密（角丸14・padding3.5）にする意図的な差。
// 見た目の地色・影は Card 部品が持ち、ここでは密度の上書きだけを渡す（cn で後勝ち）。
const card = 'mb-2.5 rounded-[14px] p-3.5';

// ピル型ボタン（様子ボタン・旅行モードボタン）。旧 pill/travelBtn と同一の見た目。
const pill =
  'h-auto rounded-full border border-border px-3.5 py-2 text-[13px] font-semibold';

function MePage() {
  const data = Route.useLoaderData();
  if (data.status !== 'ok')
    return (
      <p className="p-10 text-center text-muted-foreground">
        読み込めませんでした。
      </p>
    );
  return (
    <Me
      watchersTotal={data.watchersTotal}
      watchersLiving={data.watchersLiving}
      travelUntil={data.travelUntil}
    />
  );
}

function Me({
  watchersTotal,
  watchersLiving,
  travelUntil,
}: {
  watchersTotal: number;
  watchersLiving: number;
  travelUntil: string | null;
}) {
  const isSubject = watchersTotal > 0;
  const [signalNotice, setSignalNotice] = useState('');
  const [notice, setNotice] = useState('');

  // このページを開いたこと自体が生存シグナル（自動 web_checkin）。アプリの app_open と同じ
  // 15分スロットル。見守ってくれる人が居る本人のときだけ（届く先がある）。透明性は下に明記。
  useEffect(() => {
    if (!isSubject) return;
    const key = 'asatomo.webCheckinSentAt';
    const last = Number(localStorage.getItem(key) ?? 0);
    if (Date.now() - last < 15 * 60_000) return;
    localStorage.setItem(key, String(Date.now()));
    fetch('/api/signals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'web_checkin', source: 'web' }),
    }).catch(() => {});
  }, [isSubject]);

  async function sendSignal(kind: string, label: string) {
    setSignalNotice('');
    try {
      const res = await fetch('/api/signals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, source: 'web' }),
      });
      if (!res.ok) throw new Error(`signal failed: ${res.status}`);
      // 種別のみ送る（申告そのものに機微情報はない）。
      track('signal_sent', { kind });
      setSignalNotice(`✓ 「${label}」が届きました`);
    } catch {
      setSignalNotice('送信できませんでした。時間をおいてお試しください。');
    }
  }

  return (
    <div className={wrap}>
      {notice ? (
        <p className="mt-0 mb-2 text-center text-[13px] text-(--good)">
          {notice}
        </p>
      ) : null}

      {isSubject ? (
        <>
          {/* 1. 様子を伝える（最頻・最上部） */}
          <Card className={card}>
            <p className="m-0 text-sm font-semibold text-foreground">
              <span aria-hidden="true" className="mr-1.5">
                📣
              </span>
              いまの様子を伝える
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {(
                [
                  // アイコンはモバイル（MainActivity）と揃える。
                  ['wake', 'おはよう', '☀️'],
                  ['meal', 'ごはん', '🍚'],
                  ['sleep', 'おやすみ', '🌙'],
                  ['outing', 'いってきます', '👋'],
                  ['homecoming', 'ただいま', '🏠'],
                ] as const
              ).map(([kind, label, icon]) => (
                <Button
                  key={kind}
                  type="button"
                  variant="secondary"
                  className={pill}
                  onClick={() => sendSignal(kind, label)}
                >
                  <span aria-hidden="true" className="mr-1.5">
                    {icon}
                  </span>
                  {label}
                </Button>
              ))}
            </div>
            {/* 透明性の原則: 自動記録を隠さない（CONTEXT.md 生存シグナル）。 */}
            <p className="mt-2.5 mb-0 text-[11px] leading-[1.6] text-muted-foreground">
              このページを開いたことも「元気」として自動で伝わります。
            </p>
            <p className="mt-2 mb-0 text-xs">
              <Link to="/activity" className="text-primary hover:underline">
                あなたの記録を見る（相手にどう見えるか）→
              </Link>
            </p>
            {signalNotice ? (
              <p className="mt-2 mb-0 text-xs text-(--good)">{signalNotice}</p>
            ) : null}
          </Card>

          {/* 3. あなたを見守ってくれる人（人数は常時／2人未満だけ警告。決定6）
                 主語を明示し「あなたが見守っている人」(=仲間タブ/逆向き)との一字違いの取り違えを防ぐ。 */}
          <Card className={card}>
            <p className="m-0 text-sm text-foreground">
              <span aria-hidden="true" className="mr-1.5">
                👥
              </span>
              あなたを見守ってくれる人：<strong>{watchersTotal}人</strong>
            </p>
            {watchersLiving < 2 ? (
              <p className="mt-2 mb-0 rounded-[10px] bg-(--warn-soft) px-3 py-2.5 text-[12.5px] leading-[1.8] text-foreground">
                このままだと、もしものときに
                <strong>最後の伝言を届けられません</strong>
                。見守ってくれる人が2人になると届けられるようになります。
              </p>
            ) : null}
            <p className="mt-2.5 mb-0 text-xs">
              <Link
                to="/connections"
                className="text-muted-foreground hover:underline"
              >
                見守ってくれている人を確認・整理する →
              </Link>
            </p>
          </Card>

          {/* 4. 旅行モード（見守りの一時休止。モバイルと機能を揃える） */}
          <TravelMode initialUntil={travelUntil} />

          {/* 5. 見守り合いに誘う（成立済みには用済みなので最下部） */}
          <Invite onNotice={setNotice} />
          {/* まだ使っていない人への周知（招待＝つながり作成とは別。CONTEXT.md「紹介」） */}
          <IntroduceButton />
        </>
      ) : (
        /* 見守ってくれる人が0人＝勧誘の空状態カードに差し替え（決定6） */
        <>
          <Card className={card}>
            <p className="m-0 text-sm font-semibold text-foreground">
              あなたを見守ってくれる人は、まだいません。
            </p>
            <p className="mt-2 mb-3.5 text-[13px] leading-[1.8] text-muted-foreground">
              見守り合いに誘うと、あなたの「今日も元気」も相手に届くようになります。
            </p>
            <Invite onNotice={setNotice} />
            <IntroduceButton />
          </Card>
          <p className="text-center text-xs">
            <Link
              to="/activity"
              className="text-muted-foreground hover:underline"
            >
              あなたの記録を見る（何が記録されるか）→
            </Link>
          </p>
        </>
      )}
    </div>
  );
}

/**
 * 旅行モード（見守りの一時休止）。モバイル（MainActivity）と機能を揃える。
 * 期限まで見守りを止め、期限が来たらサーバー側で自動再開する（最長30日はサーバーが強制）。
 * 見守ってくれる人には「旅行中」として伝わる（監視は止まっても存在は隠さない）。
 */
function TravelMode({ initialUntil }: { initialUntil: string | null }) {
  const [until, setUntil] = useState<string | null>(initialUntil);
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const active = until != null && new Date(until) > new Date();

  // 入力の許容範囲：最短「明日」〜最長「30日後」（サーバーの上限に合わせる）。
  const min = ymd(addDays(new Date(), 1));
  const max = ymd(addDays(new Date(), 30));

  async function enter() {
    if (!date) return;
    setBusy(true);
    setMsg('');
    try {
      // 帰宅日いっぱいまで休止（その日の終わりに再開）。
      const untilIso = new Date(`${date}T23:59:59`).toISOString();
      const res = await fetch('/api/travel', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ until: untilIso }),
      });
      if (!res.ok) throw new Error(`travel failed: ${res.status}`);
      setUntil(untilIso);
      setMsg(`旅行モードにしました（${formatMd(untilIso)} まで）。`);
    } catch {
      setMsg('設定できませんでした。期間が長すぎないか確認してください。');
    } finally {
      setBusy(false);
    }
  }

  async function exit() {
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch('/api/travel', { method: 'DELETE' });
      if (!res.ok) throw new Error(`travel clear failed: ${res.status}`);
      setUntil(null);
      setDate('');
      setMsg('旅行モードを解除しました。見守りを再開します。');
    } catch {
      setMsg('解除できませんでした。時間をおいてお試しください。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={card}>
      <p className="m-0 text-sm font-semibold text-foreground">
        <span aria-hidden="true" className="mr-1.5">
          🧳
        </span>
        旅行モード
      </p>
      {active ? (
        <>
          <p className="mt-2.5 mb-0 text-[12.5px] leading-[1.8] text-muted-foreground">
            あなたへの見守りをお休み中です（
            <strong>{formatMd(until as string)}</strong>{' '}
            まで）。期限が来たら自動で再開します。見守ってくれる人にも「旅行中」と伝わっています。
          </p>
          <Button
            type="button"
            variant="secondary"
            className={`${pill} mt-2.5`}
            onClick={exit}
            disabled={busy}
          >
            旅行モードを解除する
          </Button>
        </>
      ) : (
        <>
          <p className="mt-2.5 mb-0 text-[12.5px] leading-[1.8] text-muted-foreground">
            旅行などで生活リズムが変わると、いつもの様子が届かず、見守ってくれる人によけいな心配をかけてしまうことがあります。その間だけ、あなたへの見守りを一時お休みにできます。期限が来たら自動で再開します（最長30日）。
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <label
              htmlFor="travel-return-date"
              className="text-[12.5px] text-foreground"
            >
              帰る日：{' '}
              <Input
                id="travel-return-date"
                type="date"
                value={date}
                min={min}
                max={max}
                onChange={(e) => setDate(e.target.value)}
                className="inline w-auto"
              />
            </label>
            <Button
              type="button"
              variant="secondary"
              className={pill}
              onClick={enter}
              disabled={busy || !date}
            >
              旅行モードにする
            </Button>
          </div>
        </>
      )}
      {msg ? (
        <p className="mt-2 mb-0 text-xs text-muted-foreground">{msg}</p>
      ) : null}
    </Card>
  );
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** <input type="date"> 用のローカル日付文字列（YYYY-MM-DD）。 */
function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 「M月D日」表示（旅行モードの期限用）。 */
function formatMd(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/**
 * 「アサトモを紹介する」導線。招待（つながりを作る）とは別に、まだ使っていない人へ
 * サービスそのものを知らせる（CONTEXT.md「紹介」）。押すと ?intro でランディングを開き、
 * ログイン中でも中身を確認しつつ共有シートで送れる（index.tsx の IntroBar）。
 */
function IntroduceButton() {
  return (
    <Button
      asChild
      variant="secondary"
      className="mt-2 h-auto w-full rounded-xl border border-border py-2.5 text-sm font-semibold"
    >
      <Link to="/" search={{ intro: true }}>
        🌤️ アサトモを紹介する
      </Link>
    </Button>
  );
}

/** 招待リンクの発行＋コピー。CTA はわたしに一本化（ADR-0008 §実装決定5）。 */
function Invite({ onNotice }: { onNotice: (m: string) => void }) {
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedRich, setCopiedRich] = useState(false);

  async function createInvite() {
    setBusy(true);
    onNotice('');
    try {
      const res = await fetch('/api/invitations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) throw new Error(`invite failed: ${res.status}`);
      const { token } = (await res.json()) as { token: string };
      setLink(`${window.location.origin}/join/${token}`);
      setCopied(false);
      // 招待リンクの発行（トークンは送らない。発行イベントのみ）。
      track('invite_created');
    } catch {
      onNotice('招待リンクの作成に失敗しました。時間をおいてお試しください。');
    } finally {
      setBusy(false);
    }
  }

  async function copyInvite() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      track('invite_link_copied', { variant: 'plain' });
    } catch {
      setCopied(false);
    }
  }

  // 招待は対面以外の経路を増やさない方針（ADR-0005）のため共有シートは使わず、
  // 既存のコピー経路のまま「一言（紹介文）を頭に付けた版」を足すだけにする。
  async function copyInviteRich() {
    if (!link) return;
    const text = `アサトモで、朝の「今日も元気」をそっと見守り合いませんか。\n下のリンクから参加できます（7日で失効）。\n${link}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedRich(true);
      track('invite_link_copied', { variant: 'rich' });
    } catch {
      setCopiedRich(false);
    }
  }

  if (link)
    return (
      <Card className={card}>
        {/* 遠くの人へ：リンクをコピーして送る（既存の経路）。 */}
        <p className="m-0 text-xs leading-[1.7] text-muted-foreground">
          <strong className="text-foreground">送るなら</strong>
          ：このリンクをコピーして、見守り合いたい相手に送ってください（7日で失効）。
        </p>
        <Input
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="mt-2 text-xs"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={copyInvite}
            className="h-auto rounded-[10px] px-3.5 py-2 text-[13px] font-semibold"
          >
            {copied ? 'コピーしました ✓' : 'リンクをコピー'}
          </Button>
          {/* 一言添えて送りたい人向け（紹介文＋リンク）。相手が固い文面に戸惑わないよう。 */}
          <Button
            type="button"
            variant="secondary"
            onClick={copyInviteRich}
            className="h-auto rounded-[10px] border border-border px-3.5 py-2 text-[13px] font-semibold"
          >
            {copiedRich ? 'コピーしました ✓' : '紹介文付きでコピー'}
          </Button>
        </div>

        {/* 目の前の人へ：その場でカメラに読ませる。QR は使い切りトークンURLを
            画像化しただけ（別概念ではない）。保存・シェアは付けない＝対面以外の
            経路を増やさない（ADR-0005 再利用リンク却下／なふだ ADR-0013 と整合）。 */}
        <div className="mt-3.5 border-t border-border pt-3.5">
          <p className="m-0 text-xs leading-[1.7] text-muted-foreground">
            <strong className="text-foreground">目の前の人になら</strong>
            ：このQRコードを相手のカメラで読み取ってもらってください（読み取れないときは上のリンクを送ってください）。
          </p>
          {/* ダークモードでも反転せず白地・黒モジュールで固定。暗背景でも浮くよう
              白の角丸プレートで囲う（quiet zone だけに頼らない）。読み取り成功が命。 */}
          <div className="mt-2.5 inline-block rounded-xl bg-white p-3 leading-0">
            <QRCodeSVG
              value={link}
              size={220}
              level="M"
              marginSize={4}
              bgColor="#FFFFFF"
              fgColor="#000000"
            />
          </div>
        </div>

        {/* 発行後にこの表示を畳んで元の状態へ戻す手段（無いと行き止まりになる）。
            リンク自体はサーバー側で7日後に失効するので、ここは表示のクローズのみ。 */}
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setLink(null);
            setCopied(false);
            setCopiedRich(false);
          }}
          className="mt-3.5 h-auto px-1 py-1.5 text-[13px] font-normal text-muted-foreground"
        >
          閉じる
        </Button>
      </Card>
    );

  return (
    <Button
      type="button"
      variant="secondary"
      onClick={createInvite}
      disabled={busy}
      className="h-auto w-full rounded-xl border border-border py-2.5 text-sm font-semibold"
    >
      🤝 見守り合いに誘う
    </Button>
  );
}
