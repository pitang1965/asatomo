import { type FormEvent, useState } from 'react';
import { openMessage } from './crypto';

/**
 * 最後の伝言の開示（受取人向け・見守りWeb）。合言葉を入力すると、この端末の中だけで
 * 復号する（ADR-0002）。運営者は暗号文しか持たず平文を読めない。
 */

export function OpenedLetter({
  fromName,
  text,
}: {
  fromName: string;
  text: string;
}) {
  return (
    <div className="letter">
      <div className="letter__from">{fromName}さんより</div>
      <div className="letter__body">{text}</div>
      <div className="letter__note">
        これは想いを伝える伝言です。財産分与などの法的効力はありません。
      </div>
    </div>
  );
}

type Status = 'locked' | 'opening' | 'open' | 'error';

/** 端末内で復号する単位（受取人ごとに複数ありうる。合言葉は受取人ごとに1つ。ADR-0011）。 */
export interface DisclosurePacked {
  messageId: string;
  ciphertext: string;
  iv: string;
  wrappedDek: string;
}

export function MessageDisclosure({
  fromName,
  hint,
  messages,
}: {
  fromName: string;
  hint?: string | null;
  /** この受取人宛の開示成立済みの伝言。合言葉を一度入力すれば全て解ける（ADR-0011 §3）。 */
  messages: DisclosurePacked[];
}) {
  const [passphrase, setPassphrase] = useState('');
  const [status, setStatus] = useState<Status>('locked');
  const [letters, setLetters] = useState<{ id: string; text: string }[]>([]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus('opening');
    try {
      // 同じ合言葉で各伝言の wrappedDek を順に解く。1つでも失敗したら合言葉違いとして扱う。
      const opened = await Promise.all(
        messages.map(async (m) => ({
          id: m.messageId,
          text: await openMessage(m, passphrase),
        })),
      );
      setLetters(opened);
      setStatus('open');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'open')
    return (
      <div className="watch">
        {letters.map((l) => (
          <OpenedLetter key={l.id} fromName={fromName} text={l.text} />
        ))}
      </div>
    );

  return (
    <div className="watch">
      <div className="unlock">
        <div className="unlock__ico">🕊️</div>
        <h2 className="unlock__title">{fromName}さんからの伝言</h2>
        <p className="unlock__sub">
          {fromName}
          さんが、あなたへ言葉を遺されました。合言葉を入力して開いてください。
        </p>
        <form onSubmit={onSubmit}>
          <input
            className="unlock__input"
            type="text"
            autoComplete="off"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="合言葉"
            aria-label="合言葉"
          />
          {hint ? <p className="unlock__hint">ヒント: {hint}</p> : null}
          {status === 'error' ? (
            <p className="unlock__err">
              合言葉が違うようです。もう一度お試しください。
            </p>
          ) : null}
          <button
            type="submit"
            className="btn btn--calm"
            disabled={status === 'opening' || passphrase.length === 0}
          >
            {status === 'opening' ? '開いています…' : '開く'}
          </button>
        </form>
        <p className="unlock__fine">
          この内容は運営者も読めません。復号はこの端末の中だけで行われます。
        </p>
      </div>
    </div>
  );
}
