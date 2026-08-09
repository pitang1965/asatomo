import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { openMessage } from './crypto';

/**
 * 最後の伝言の開示（受取人向け・見守りWeb）。合言葉を入力すると、この端末の中だけで
 * 復号する（ADR-0002）。運営者は暗号文しか持たず平文を読めない。
 */

// 旧 .watch コンテナ（560幅・中央寄せ）。
const watchCls =
  'mx-auto min-h-screen max-w-149 bg-background px-4.5 pt-5.5 pb-15 leading-[1.7]';

export function OpenedLetter({
  fromName,
  text,
}: {
  fromName: string;
  text: string;
}) {
  return (
    <div className="mx-auto my-6.5 max-w-105 rounded-2xl border border-border bg-card px-6.5 py-7 shadow-(--shadow-sm)">
      <div className="mb-4 text-[13px] tracking-[0.04em] text-(--ink-3)">
        {fromName}さんより
      </div>
      <div className="text-base leading-loose whitespace-pre-wrap text-foreground">
        {text}
      </div>
      <div className="mt-5.5 border-t border-dashed border-border pt-4 text-[11.5px] text-(--ink-3)">
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
      <div className={watchCls}>
        {letters.map((l) => (
          <OpenedLetter key={l.id} fromName={fromName} text={l.text} />
        ))}
      </div>
    );

  return (
    <div className={watchCls}>
      <div className="mx-auto my-5 max-w-95 text-center">
        <div className="text-[44px]">🕊️</div>
        <h2 className="mt-2.5 mb-2 text-xl">{fromName}さんからの伝言</h2>
        <p className="mb-5 text-sm text-muted-foreground">
          {fromName}
          さんが、あなたへ言葉を遺されました。合言葉を入力して開いてください。
        </p>
        <form onSubmit={onSubmit}>
          <Input
            className="mb-2.5 h-auto rounded-[13px] px-3.75 py-3.25 text-base md:text-base"
            type="text"
            autoComplete="off"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="合言葉"
            aria-label="合言葉"
          />
          {hint ? (
            <p className="mb-3 text-[12.5px] text-(--ink-3)">ヒント: {hint}</p>
          ) : null}
          {status === 'error' ? (
            <p className="mb-3 text-[13px] text-(--crit)">
              合言葉が違うようです。もう一度お試しください。
            </p>
          ) : null}
          <Button
            type="submit"
            variant="secondary"
            className="h-auto w-full rounded-[13px] bg-(--good) py-3.25 text-[14.5px] font-semibold text-white hover:bg-(--good)/90"
            disabled={status === 'opening' || passphrase.length === 0}
          >
            {status === 'opening' ? '開いています…' : '開く'}
          </Button>
        </form>
        <p className="mt-4 text-[11.5px] text-(--ink-3)">
          この内容は運営者も読めません。復号はこの端末の中だけで行われます。
        </p>
      </div>
    </div>
  );
}
