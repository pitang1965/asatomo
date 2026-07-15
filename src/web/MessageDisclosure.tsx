import { type FormEvent, useState } from 'react';
import { openMessage } from './crypto';

/**
 * 最後のメッセージの開示（受取人向け・見守りWeb）。合言葉を入力すると、この端末の中だけで
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
        これは想いを伝えるメッセージです。財産分与などの法的効力はありません。
      </div>
    </div>
  );
}

type Status = 'locked' | 'opening' | 'open' | 'error';

export function MessageDisclosure({
  fromName,
  hint,
  ciphertext,
  iv,
  wrappedDek,
}: {
  fromName: string;
  hint?: string;
  ciphertext: string;
  iv: string;
  wrappedDek: string;
}) {
  const [passphrase, setPassphrase] = useState('');
  const [status, setStatus] = useState<Status>('locked');
  const [text, setText] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus('opening');
    try {
      const opened = await openMessage(
        { ciphertext, iv, wrappedDek },
        passphrase,
      );
      setText(opened);
      setStatus('open');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'open')
    return (
      <div className="watch">
        <OpenedLetter fromName={fromName} text={text} />
      </div>
    );

  return (
    <div className="watch">
      <div className="unlock">
        <div className="unlock__ico">🕊️</div>
        <h2 className="unlock__title">{fromName}さんからのメッセージ</h2>
        <p className="unlock__sub">
          {fromName}
          さんが、あなたへ言葉を遺されました。合言葉を入力して開いてください。
        </p>
        <form onSubmit={onSubmit}>
          <input
            className="unlock__input"
            type="password"
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
