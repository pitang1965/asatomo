import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { fetchMessagesPage } from '../server/functions';
import { track } from '../web/analytics';
import {
  decryptPacked,
  decryptText,
  encryptPacked,
  encryptText,
  generateDek,
  unwrapDek,
  wrapDek,
} from '../web/crypto';

/**
 * 最後の伝言の管理画面（本人側）。暗号化はすべてこのブラウザ内で行う（ADR-0002）:
 *   本文/見出し → DEK で暗号化、DEK → 本人の合言葉 + 受取人ごとの合言葉でマルチラップ。
 * サーバへは暗号材料だけを送る（POST /api/messages）。読み返しも本人の合言葉で端末内復号。
 * 合言葉を忘れると誰にも復元できない（受託しないことが仕様）。
 */
export const Route = createFileRoute('/_app/messages')({
  loader: () => fetchMessagesPage(),
  component: MessagesPage,
});

// カードのレイアウト（見た目は Card 部品が持つ）。この画面はカードを wrap(560) の内側に
// 置くため 560 幅でフィットする。standalone の Center も同じ 560 外枠にしたいので max-w-140。
const cardW = 'mx-auto my-4 max-w-140';

// ラベル（旧 labelStyle）。
const labelCls = 'mt-3.5 block text-xs font-semibold text-muted-foreground';

// 全幅の主要ボタン（角丸13・padding13/16・14.5px・太字）。
const btnBase = 'h-auto rounded-[13px] py-3 text-[14.5px] font-semibold';
// btn--calm＝落ち着いた緑（--good）+白文字（警告色は使わない）。variant を className で上書き。
const calmBtn = `${btnBase} bg-(--good) text-white hover:bg-(--good)/90`;
// btn--ghost＝surface-2 + ボーダー（secondary variant がそのまま該当）。
const ghostBtn = `${btnBase} border border-border`;

function MessagesPage() {
  const data = Route.useLoaderData();
  // あなたの合言葉はアカウント単位（全伝言共通）。ページ最上部で1回だけ入力し、
  // 作成・読み返し・宛先編集のすべてがこれを参照する。サーバには送らない。
  const [masterPass, setMasterPass] = useState('');
  const [hidePass, setHidePass] = useState(false);

  if (data.status === 'unconfigured')
    return <Center title="サーバーが未設定です" body={data.message} />;
  if (data.status === 'signed_out')
    return (
      <Center
        title="ログインが必要です"
        body="最後の伝言の作成・管理は、ご本人のアカウントで行います。"
      />
    );

  return (
    <div className="min-h-screen bg-background">
      {/* 見出し・説明・カードすべてを 560 の枠に収め、他タブとカードの実効幅を揃える。 */}
      <div className="mx-auto max-w-148 px-4">
        <h1 className="mt-2 pt-3 text-center text-xl text-foreground">
          最後の伝言
        </h1>
        <p className="mt-1.5 text-center text-xs text-(--ink-3)">
          本文はこの端末の中で暗号化されます。運営者にも読めません。
          合言葉を忘れると誰にも復元できないため、大切に保管してください。
        </p>

        <Card className={cardW}>
          <label
            htmlFor="msg-master-pass"
            className="block text-xs font-semibold text-muted-foreground"
          >
            編集用パスワード（全伝言共通・あなただけの秘密）
            <Input
              id="msg-master-pass"
              className="mt-1.5"
              type={hidePass ? 'password' : 'text'}
              autoComplete="off"
              placeholder="例: 自分しか知らない思い出の言葉（4文字以上）"
              value={masterPass}
              onChange={(e) => setMasterPass(e.target.value)}
            />
          </label>
          <label className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={hidePass}
              onChange={(e) => setHidePass(e.target.checked)}
            />
            パスワードや合言葉を伏せ字にする（人に画面を見られたくないとき）
          </label>
          <p className="mt-2 text-[11px] text-(--ink-3)">
            読み返し・編集・保存に使います。保存すると、あなた自身もこのパスワードなしでは読み返せなくなります（運営者にも読めない仕組みのため）。
            宛先の合言葉（相手と共有するもの）とは別物です。誰にも教えない一生ものを1つ決めてください。
          </p>
        </Card>

        <MessageList
          messages={data.messages}
          connections={data.connections}
          masterPass={masterPass}
        />
        <CreateForm
          connections={data.connections}
          masterPass={masterPass}
          hidePass={hidePass}
        />
      </div>
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
        <p className="mt-4 text-[13px]">
          <Link to="/" className="text-primary hover:underline">
            ← トップへ
          </Link>
        </p>
      </Card>
    </div>
  );
}

type Loaded = Extract<
  Awaited<ReturnType<typeof fetchMessagesPage>>,
  { status: 'ok' }
>;

// ─── 一覧（本人の合言葉で端末内復号して読み返せる） ──────────────────────────
function MessageList({
  messages,
  connections,
  masterPass,
}: {
  messages: Loaded['messages'];
  connections: Loaded['connections'];
  masterPass: string;
}) {
  const router = useRouter();
  const nameOf = (connectionId: string) =>
    connections.find((c) => c.id === connectionId)?.displayName ?? '（不明）';

  if (messages.length === 0)
    return (
      <Card className={`${cardW} text-center`}>
        <p className="text-[13px] text-muted-foreground">
          まだ伝言はありません。下のフォームから作成できます。
        </p>
      </Card>
    );

  return (
    <div>
      {messages.map((m) => (
        <MessageCard
          key={m.id}
          msg={m}
          connections={connections}
          recipientNames={m.recipientConnectionIds.map(nameOf)}
          masterPass={masterPass}
          onChanged={() => router.invalidate()}
        />
      ))}
    </div>
  );
}

function MessageCard({
  msg,
  connections,
  recipientNames,
  masterPass,
  onChanged,
}: {
  msg: Loaded['messages'][number];
  connections: Loaded['connections'];
  recipientNames: string[];
  masterPass: string;
  onChanged: () => void;
}) {
  const [opened, setOpened] = useState<{
    label: string;
    body: string;
    dek: CryptoKey;
  } | null>(null);
  const [error, setError] = useState('');
  // どの操作を処理中か（開く/削除で別ボタンにスピナーを出す。null = 待機）。
  const [busyKind, setBusyKind] = useState<'open' | 'remove' | null>(null);
  const busy = busyKind !== null;

  async function open() {
    setBusyKind('open');
    setError('');
    try {
      const dek = await unwrapDek(msg.authorWrappedDek, masterPass);
      setOpened({
        label: await decryptPacked(msg.encryptedLabel, dek),
        body: await decryptText(msg.ciphertext, msg.iv, dek),
        dek,
      });
    } catch {
      setError(
        '編集用パスワードが違うようです。ページ上部の欄をご確認ください。',
      );
    } finally {
      setBusyKind(null);
    }
  }

  async function remove() {
    if (!window.confirm('この伝言を削除しますか？元に戻せません。')) return;
    setBusyKind('remove');
    try {
      const res = await fetch('/api/messages', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messageId: msg.id }),
      });
      if (!res.ok) throw new Error(String(res.status));
      onChanged();
    } catch {
      setError('削除に失敗しました。');
      setBusyKind(null);
    }
  }

  return (
    <Card className={cardW}>
      <div className="text-xs text-(--ink-3)">
        {new Date(msg.createdAt).toLocaleString('ja-JP')} 作成 ・ 宛先:{' '}
        {recipientNames.length > 0 ? recipientNames.join('、') : '（未指定）'}
      </div>

      {opened ? (
        <div className="mt-3">
          <div className="font-bold text-foreground">
            {opened.label || '（見出しなし）'}
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-[1.9] text-foreground">
            {opened.body}
          </p>
          <RecipientEditor
            msg={msg}
            dek={opened.dek}
            connections={connections}
            onSaved={onChanged}
          />
          <Button
            type="button"
            variant="secondary"
            className={`${ghostBtn} mt-3 w-full`}
            onClick={() => setOpened(null)}
          >
            閉じる
          </Button>
        </div>
      ) : (
        <div className="mt-2.5">
          {masterPass.length === 0 ? (
            <p className="m-0 text-xs text-(--ink-3)">
              開くには、ページ上部の「編集用パスワード」を入力してください。
            </p>
          ) : null}
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className={`${calmBtn} flex-1`}
              disabled={busy || masterPass.length === 0}
              aria-busy={busyKind === 'open'}
              onClick={open}
            >
              {busyKind === 'open' && <Spinner />}
              {busyKind === 'open' ? '開いています…' : '開く'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className={`${ghostBtn} flex-1`}
              disabled={busy}
              aria-busy={busyKind === 'remove'}
              onClick={remove}
            >
              {busyKind === 'remove' && <Spinner />}
              {busyKind === 'remove' ? '削除しています…' : '削除'}
            </Button>
          </div>
        </div>
      )}
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </Card>
  );
}

// ─── 宛先の後から編集（伝言を開いた状態でのみ可能） ─────────────────────
//   既存宛先: 保存済みの wrappedDek を再利用（合言葉の再入力は不要）。
//   新規宛先: 開封で得た DEK をその人の合言葉でラップして追加。
function RecipientEditor({
  msg,
  dek,
  connections,
  onSaved,
}: {
  msg: Loaded['messages'][number];
  dek: CryptoKey;
  connections: Loaded['connections'];
  onSaved: () => void;
}) {
  const existing = new Map(
    msg.recipients.map((r) => [r.connectionId, r.wrappedDek]),
  );
  // null = 既存（wrappedDek 再利用）/ string = 新規（合言葉の入力値）
  const [sel, setSel] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(msg.recipients.map((r) => [r.connectionId, null])),
  );
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const toggle = (id: string) =>
    setSel((s) => {
      const next = { ...s };
      if (id in next) delete next[id];
      else next[id] = existing.has(id) ? null : '';
      return next;
    });

  const dirty =
    Object.keys(sel).length !== msg.recipients.length ||
    msg.recipients.some((r) => !(r.connectionId in sel));
  const canSave =
    !busy &&
    dirty &&
    Object.values(sel).every((v) => v === null || v.length >= 4);

  async function save() {
    setBusy(true);
    setError('');
    try {
      const recipients = await Promise.all(
        Object.entries(sel).map(async ([connectionId, v]) => ({
          connectionId,
          wrappedDek:
            v === null
              ? (existing.get(connectionId) ?? '')
              : await wrapDek(dek, v),
        })),
      );
      const res = await fetch('/api/messages/recipients', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messageId: msg.id, recipients }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setEditing(false);
      onSaved();
    } catch {
      setError('宛先の保存に失敗しました。');
    } finally {
      setBusy(false);
    }
  }

  if (!editing)
    return (
      <Button
        type="button"
        variant="secondary"
        className={`${ghostBtn} mt-3 w-full`}
        onClick={() => setEditing(true)}
      >
        宛先を編集
      </Button>
    );

  return (
    <div className="mt-3 rounded-xl border border-border p-3">
      <div className={labelCls}>宛先（チェックを外すと届かなくなります）</div>
      {connections.map((c) => (
        <div key={c.id} className="mt-2">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={c.id in sel}
              onChange={() => toggle(c.id)}
            />
            {c.displayName}
            {existing.has(c.id) && c.id in sel ? (
              <span className="text-[11px] text-(--ink-3)">
                （設定済みの合言葉のまま）
              </span>
            ) : null}
          </label>
          {c.id in sel && sel[c.id] !== null ? (
            <Input
              className="mt-1.5 ml-6.5 w-[calc(100%-26px)]"
              type="text"
              autoComplete="off"
              placeholder="合言葉＝答え（例: インコのピーコ・4文字以上）"
              value={sel[c.id] ?? ''}
              onChange={(e) =>
                setSel((s) => ({ ...s, [c.id]: e.target.value }))
              }
            />
          ) : null}
        </div>
      ))}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          variant="secondary"
          className={`${calmBtn} flex-1`}
          disabled={!canSave}
          aria-busy={busy}
          onClick={save}
        >
          {busy && <Spinner />}
          {busy ? '保存しています…' : '宛先を保存'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className={`${ghostBtn} flex-1`}
          disabled={busy}
          onClick={() => setEditing(false)}
        >
          やめる
        </Button>
      </div>
    </div>
  );
}

// ─── 作成フォーム（端末内で暗号化 → 暗号材料だけを送信） ──────────────────────
function CreateForm({
  connections,
  masterPass,
  hidePass,
}: {
  connections: Loaded['connections'];
  /** ページ上部で入力する、アカウント共通の「あなたの合言葉」。 */
  masterPass: string;
  hidePass: boolean;
}) {
  const router = useRouter();
  const [label, setLabel] = useState('');
  const [body, setBody] = useState('');
  const [recips, setRecips] = useState<Record<string, string>>({}); // connectionId → 合言葉
  const [hints, setHints] = useState<Record<string, string>>({}); // connectionId → ヒント
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const toggle = (id: string) =>
    setRecips((r) => {
      const next = { ...r };
      if (id in next) delete next[id];
      else {
        next[id] = '';
        // 登録済みヒントがあれば編集用に引き継ぐ。
        const existing = connections.find((c) => c.id === id)?.passphraseHint;
        setHints((h) => ({ ...h, [id]: h[id] ?? existing ?? '' }));
      }
      return next;
    });

  const selectedIds = Object.keys(recips);
  const nameOf = (id: string) =>
    connections.find((c) => c.id === id)?.displayName ?? '宛先';
  // 何が足りないかを可視化する（無言で無効になるボタンにしない）。
  const unmet: string[] = [];
  if (body.trim().length === 0) unmet.push('本文を入力してください');
  if (masterPass.length < 4)
    unmet.push('ページ上部の「編集用パスワード」を4文字以上で入力してください');
  for (const id of selectedIds) {
    if ((recips[id] ?? '').length < 4)
      unmet.push(`${nameOf(id)}さんの合言葉を4文字以上にしてください`);
  }
  const canSubmit = unmet.length === 0 && !busy;

  async function submit() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const dek = await generateDek();
      const { ciphertext, iv } = await encryptText(body, dek);
      const encryptedLabel = await encryptPacked(label, dek);
      const authorWrappedDek = await wrapDek(dek, masterPass);
      const recipients = await Promise.all(
        selectedIds.map(async (connectionId) => ({
          connectionId,
          wrappedDek: await wrapDek(dek, recips[connectionId] ?? ''),
        })),
      );

      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          encryptedLabel,
          ciphertext,
          iv,
          authorWrappedDek,
          recipients,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));

      // 伝言作成（本文・見出し・合言葉は送らず、宛先の件数のみ）。
      track('message_created', { recipient_count: selectedIds.length });

      // 変更のあったヒントを保存（つながり単位・平文でよい情報）。失敗しても本体は保存済み。
      await Promise.all(
        selectedIds.map(async (id) => {
          const hint = (hints[id] ?? '').trim();
          const existing = connections.find((c) => c.id === id)?.passphraseHint;
          if (hint === (existing ?? '')) return;
          await fetch('/api/connections/passphrase-hint', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              connectionId: id,
              hint: hint === '' ? null : hint,
            }),
          }).catch(() => {});
        }),
      );

      setLabel('');
      setBody('');
      setRecips({});
      setHints({});
      setNotice('暗号化して保存しました。');
      await router.invalidate();
    } catch {
      setError('保存に失敗しました。時間をおいてもう一度お試しください。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={cardW}>
      <h2 className="m-0 text-base text-foreground">新しい伝言</h2>

      <label htmlFor="msg-label" className={labelCls}>
        見出し（任意・これも暗号化されます）
        <Input
          id="msg-label"
          className="mt-1.5"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="例: みなみへ"
        />
      </label>

      <label htmlFor="msg-body" className={labelCls}>
        本文
        <Textarea
          id="msg-body"
          className="mt-1.5 min-h-30 resize-y"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="伝えたいことを、そのまま。"
        />
      </label>

      <div className={labelCls}>宛先（受取人）と、それぞれの合言葉</div>
      <p className="mt-1 text-[11px] text-(--ink-3)">
        合言葉は、その人が伝言を開けるための鍵です。生前に直接伝えておいてください。
        人ごとに内容を変えたいときは、宛先を分けて複数の伝言を作れます。
      </p>
      {connections.length === 0 ? (
        <p className="text-xs text-(--ink-3)">
          つながりがまだありません。宛先なしでも保存できます（あとから指定できます）。
        </p>
      ) : (
        connections.map((c) => (
          <div key={c.id} className="mt-2">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={c.id in recips}
                onChange={() => toggle(c.id)}
              />
              {c.displayName}
              {c.isWatcher ? (
                <Badge variant="muted" className="text-[11px]">
                  見守り者
                </Badge>
              ) : null}
            </label>
            {c.id in recips ? (
              <div className="ml-6.5">
                <Input
                  className="mt-1.5"
                  type={hidePass ? 'password' : 'text'}
                  autoComplete="off"
                  placeholder="合言葉＝答え（例: インコのピーコ・4文字以上）"
                  value={recips[c.id] ?? ''}
                  onChange={(e) =>
                    setRecips((r) => ({ ...r, [c.id]: e.target.value }))
                  }
                />
                <Input
                  className="mt-1.5"
                  type="text"
                  placeholder="ヒント＝質問と形式例（例: 最初に飼った鳥の種類と名前は？ 例：カラスのガーちゃん）"
                  value={hints[c.id] ?? ''}
                  onChange={(e) =>
                    setHints((h) => ({ ...h, [c.id]: e.target.value }))
                  }
                />
              </div>
            ) : null}
          </div>
        ))
      )}

      <p className="mt-3 text-[11px] text-(--ink-3)">
        合言葉（答え）は保存されません。口頭で伝えるか、自宅の秘密の場所に紙で残すことをおすすめします。
        ヒント（質問）は平文で保存され、開示のとき受取人に添えられます。
        合言葉は1文字でも違うと開けないため、ヒントに答えの形式をダミー例で添えると
        （例：カラスのガーちゃん）、受取人が表記に迷いません。
      </p>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {notice ? <p className="text-xs text-(--good)">{notice}</p> : null}

      <Button
        type="button"
        variant="secondary"
        className={`${calmBtn} mt-3 w-full`}
        disabled={!canSubmit}
        aria-busy={busy}
        onClick={submit}
      >
        {busy && <Spinner />}
        {busy ? '保存しています…' : '暗号化して保存'}
      </Button>
      {!canSubmit && !busy && unmet.length > 0 ? (
        <ul className="mt-2 list-disc pl-4.5 text-[11px] text-(--ink-3)">
          {unmet.map((u) => (
            <li key={u}>{u}</li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
