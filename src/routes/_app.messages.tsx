import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { type CSSProperties, useState } from 'react';
import { fetchMessagesPage } from '../server/functions';
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
 * 最後のメッセージの管理画面（本人側）。暗号化はすべてこのブラウザ内で行う（ADR-0002）:
 *   本文/見出し → DEK で暗号化、DEK → 本人の合言葉 + 受取人ごとの合言葉でマルチラップ。
 * サーバへは暗号材料だけを送る（POST /api/messages）。読み返しも本人の合言葉で端末内復号。
 * 合言葉を忘れると誰にも復元できない（受託しないことが仕様）。
 */
export const Route = createFileRoute('/_app/messages')({
  loader: () => fetchMessagesPage(),
  component: MessagesPage,
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
  maxWidth: 560,
  margin: '16px auto',
  boxShadow: '0 4px 20px rgb(0 0 0 / 0.06)',
};

const input: CSSProperties = {
  font: 'inherit',
  fontSize: 14,
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--line)',
  background: 'var(--surface-2)',
  color: 'var(--ink)',
  marginTop: 6,
};

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--ink-2)',
  marginTop: 14,
};

function MessagesPage() {
  const data = Route.useLoaderData();
  // あなたの合言葉はアカウント単位（全メッセージ共通）。ページ最上部で1回だけ入力し、
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
    <div style={page}>
      <h1
        style={{
          textAlign: 'center',
          fontSize: 20,
          color: 'var(--ink)',
          margin: '8px 0 0',
          paddingTop: 12,
        }}
      >
        最後の伝言
      </h1>
      <p
        style={{
          textAlign: 'center',
          fontSize: 12,
          color: 'var(--ink-3)',
          margin: '6px 16px 0',
        }}
      >
        本文はこの端末の中で暗号化されます。運営者にも読めません。
        合言葉を忘れると誰にも復元できないため、大切に保管してください。
      </p>

      <div style={card}>
        <label style={{ ...labelStyle, marginTop: 0 }}>
          編集用パスワード（全伝言共通・あなただけの秘密）
          <input
            style={input}
            type={hidePass ? 'password' : 'text'}
            autoComplete="off"
            placeholder="例: 自分しか知らない思い出の言葉（4文字以上）"
            value={masterPass}
            onChange={(e) => setMasterPass(e.target.value)}
          />
        </label>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: 'var(--ink-2)',
            marginTop: 8,
          }}
        >
          <input
            type="checkbox"
            checked={hidePass}
            onChange={(e) => setHidePass(e.target.checked)}
          />
          パスワードや合言葉を伏せ字にする（人に画面を見られたくないとき）
        </label>
        <p style={{ fontSize: 11, color: 'var(--ink-3)', margin: '8px 0 0' }}>
          読み返し・編集・保存に使います。保存すると、あなた自身もこのパスワードなしでは読み返せなくなります（運営者にも読めない仕組みのため）。
          宛先の合言葉（相手と共有するもの）とは別物です。誰にも教えない一生ものを1つ決めてください。
        </p>
      </div>

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
        <p style={{ marginTop: 16, fontSize: 13 }}>
          <Link to="/" style={{ color: 'var(--accent)' }}>
            ← トップへ
          </Link>
        </p>
      </div>
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
      <div style={{ ...card, textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: 'var(--ink-2)' }}>
          まだ伝言はありません。下のフォームから作成できます。
        </p>
      </div>
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
  const [busy, setBusy] = useState(false);

  async function open() {
    setBusy(true);
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
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm('この伝言を削除しますか？元に戻せません。')) return;
    setBusy(true);
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
      setBusy(false);
    }
  }

  return (
    <div style={card}>
      <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
        {new Date(msg.createdAt).toLocaleString('ja-JP')} 作成 ・ 宛先:{' '}
        {recipientNames.length > 0 ? recipientNames.join('、') : '（未指定）'}
      </div>

      {opened ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 700, color: 'var(--ink)' }}>
            {opened.label || '（見出しなし）'}
          </div>
          <p
            style={{
              whiteSpace: 'pre-wrap',
              fontSize: 14,
              color: 'var(--ink)',
              lineHeight: 1.9,
              marginTop: 8,
            }}
          >
            {opened.body}
          </p>
          <RecipientEditor
            msg={msg}
            dek={opened.dek}
            connections={connections}
            onSaved={onChanged}
          />
          <button
            type="button"
            className="btn btn--ghost"
            style={{ marginTop: 12 }}
            onClick={() => setOpened(null)}
          >
            閉じる
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 10 }}>
          {masterPass.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: 0 }}>
              開くには、ページ上部の「編集用パスワード」を入力してください。
            </p>
          ) : null}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              type="button"
              className="btn btn--calm"
              disabled={busy || masterPass.length === 0}
              onClick={open}
            >
              開く
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={busy}
              onClick={remove}
            >
              削除
            </button>
          </div>
        </div>
      )}
      {error ? (
        <p style={{ fontSize: 12, color: 'var(--bad, #b14)', marginTop: 8 }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

// ─── 宛先の後から編集（メッセージを開いた状態でのみ可能） ─────────────────────
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
      <button
        type="button"
        className="btn btn--ghost"
        style={{ marginTop: 12 }}
        onClick={() => setEditing(true)}
      >
        宛先を編集
      </button>
    );

  return (
    <div
      style={{
        marginTop: 12,
        padding: 12,
        borderRadius: 12,
        border: '1px solid var(--line)',
      }}
    >
      <div style={labelStyle}>宛先（チェックを外すと届かなくなります）</div>
      {connections.map((c) => (
        <div key={c.id} style={{ marginTop: 8 }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 14,
              color: 'var(--ink)',
            }}
          >
            <input
              type="checkbox"
              checked={c.id in sel}
              onChange={() => toggle(c.id)}
            />
            {c.displayName}
            {existing.has(c.id) && c.id in sel ? (
              <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                （設定済みの合言葉のまま）
              </span>
            ) : null}
          </label>
          {c.id in sel && sel[c.id] !== null ? (
            <input
              style={{ ...input, marginLeft: 26, width: 'calc(100% - 26px)' }}
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
      {error ? (
        <p style={{ fontSize: 12, color: 'var(--bad, #b14)' }}>{error}</p>
      ) : null}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          type="button"
          className="btn btn--calm"
          disabled={!canSave}
          onClick={save}
        >
          宛先を保存
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={busy}
          onClick={() => setEditing(false)}
        >
          やめる
        </button>
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
    <div style={card}>
      <h2 style={{ fontSize: 16, color: 'var(--ink)', margin: 0 }}>
        新しい伝言
      </h2>

      <label style={labelStyle}>
        見出し（任意・これも暗号化されます）
        <input
          style={input}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="例: みなみへ"
        />
      </label>

      <label style={labelStyle}>
        本文
        <textarea
          style={{ ...input, minHeight: 120, resize: 'vertical' }}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="伝えたいことを、そのまま。"
        />
      </label>

      <div style={labelStyle}>宛先（受取人）と、それぞれの合言葉</div>
      <p style={{ fontSize: 11, color: 'var(--ink-3)', margin: '4px 0 0' }}>
        合言葉は、その人が伝言を開けるための鍵です。生前に直接伝えておいてください。
        人ごとに内容を変えたいときは、宛先を分けて複数の伝言を作れます。
      </p>
      {connections.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>
          つながりがまだありません。宛先なしでも保存できます（あとから指定できます）。
        </p>
      ) : (
        connections.map((c) => (
          <div key={c.id} style={{ marginTop: 8 }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 14,
                color: 'var(--ink)',
              }}
            >
              <input
                type="checkbox"
                checked={c.id in recips}
                onChange={() => toggle(c.id)}
              />
              {c.displayName}
              {c.isWatcher ? (
                <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                  （見守り者）
                </span>
              ) : null}
            </label>
            {c.id in recips ? (
              <div style={{ marginLeft: 26 }}>
                <input
                  style={input}
                  type={hidePass ? 'password' : 'text'}
                  autoComplete="off"
                  placeholder="合言葉＝答え（例: インコのピーコ・4文字以上）"
                  value={recips[c.id] ?? ''}
                  onChange={(e) =>
                    setRecips((r) => ({ ...r, [c.id]: e.target.value }))
                  }
                />
                <input
                  style={input}
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

      <p style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 12 }}>
        合言葉（答え）は保存されません。口頭で伝えるか、自宅の秘密の場所に紙で残すことをおすすめします。
        ヒント（質問）は平文で保存され、開示のとき受取人に添えられます。
        合言葉は1文字でも違うと開けないため、ヒントに答えの形式をダミー例で添えると
        （例：カラスのガーちゃん）、受取人が表記に迷いません。
      </p>

      {error ? (
        <p style={{ fontSize: 12, color: 'var(--bad, #b14)' }}>{error}</p>
      ) : null}
      {notice ? (
        <p style={{ fontSize: 12, color: 'var(--good)' }}>{notice}</p>
      ) : null}

      <button
        type="button"
        className="btn btn--calm"
        style={{ width: '100%', marginTop: 12 }}
        disabled={!canSubmit}
        onClick={submit}
      >
        暗号化して保存
      </button>
      {!canSubmit && !busy && unmet.length > 0 ? (
        <ul
          style={{
            fontSize: 11,
            color: 'var(--ink-3)',
            margin: '8px 0 0',
            paddingLeft: 18,
          }}
        >
          {unmet.map((u) => (
            <li key={u}>{u}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
