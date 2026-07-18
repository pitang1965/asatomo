import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import type { DashboardRow } from '../domain/queries';
import { encryptText, generateDek, wrapDek } from '../web/crypto';
import { DeathConfirm } from '../web/DeathConfirm';
import { MessageDisclosure } from '../web/MessageDisclosure';
import { WatchDashboard } from '../web/WatchDashboard';

/**
 * 見守りWeb のプレビュー画面（モックデータ、DB不要）。デザイン確認用に残す。
 * 実データ画面はトップ（/）で、こちらはログインせずに全画面を見られる。
 * 「最後のメッセージ」は実際に暗号化 → 合言葉「ポチ」で本物の復号が走る（ゼロ知識のデモ）。
 */
export const Route = createFileRoute('/preview')({
  component: App,
});

const NOW = new Date();
const ago = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

const rows: DashboardRow[] = [
  {
    subjectUserId: 's1',
    name: '佐藤 健太',
    state: 'watchers_alerted',
    travelUntil: null,
    currentPresence: 'none',
    lastSignalAt: ago(32),
    latestKind: 'meal',
    latestAt: ago(32),
    isAlert: true,
  },
  {
    subjectUserId: 's2',
    name: '田中 みなみ',
    state: 'normal',
    travelUntil: null,
    currentPresence: 'none',
    lastSignalAt: ago(2),
    latestKind: 'meal',
    latestAt: ago(2),
    isAlert: false,
  },
  {
    subjectUserId: 's3',
    name: '山本 涼',
    state: 'normal',
    travelUntil: null,
    currentPresence: 'sleeping',
    lastSignalAt: ago(8),
    latestKind: 'sleep',
    latestAt: ago(8),
    isAlert: false,
  },
  {
    subjectUserId: 's4',
    name: '鈴木 あや',
    state: 'normal',
    travelUntil: new Date(NOW.getTime() + 6 * 86_400_000),
    currentPresence: 'none',
    lastSignalAt: ago(20),
    latestKind: 'app_open',
    latestAt: ago(20),
    isAlert: false,
  },
];

type Screen = 'dash' | 'death' | 'msg';
type Packed = { ciphertext: string; iv: string; wrappedDek: string };

function App() {
  const [screen, setScreen] = useState<Screen>('dash');
  const [notice, setNotice] = useState('');
  const [packed, setPacked] = useState<Packed | null>(null);

  useEffect(() => {
    (async () => {
      const dek = await generateDek();
      const { ciphertext, iv } = await encryptText(
        'みなみへ\n\nいつも、そばにいてくれてありがとう。\nどうか、元気で。',
        dek,
      );
      const wrappedDek = await wrapDek(dek, 'ポチ');
      setPacked({ ciphertext, iv, wrappedDek });
    })();
  }, []);

  const tab = (id: Screen, label: string) => (
    <button
      type="button"
      onClick={() => {
        setScreen(id);
        setNotice('');
      }}
      style={{
        appearance: 'none',
        border: 0,
        cursor: 'pointer',
        font: 'inherit',
        padding: '8px 14px',
        borderRadius: 999,
        fontWeight: 600,
        fontSize: 13,
        background: screen === id ? 'var(--accent)' : 'var(--surface-2)',
        color: screen === id ? '#fff' : 'var(--ink-2)',
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      style={{
        background: 'var(--bg)',
        minHeight: '100vh',
        fontFamily: 'var(--font-jp)',
      }}
    >
      <nav
        style={{
          display: 'flex',
          gap: 8,
          justifyContent: 'center',
          padding: 16,
          flexWrap: 'wrap',
        }}
      >
        {tab('dash', 'ダッシュボード')}
        {tab('death', '死亡確認')}
        {tab('msg', '最後のメッセージ')}
      </nav>

      {notice ? (
        <p style={{ textAlign: 'center', color: 'var(--good)', fontSize: 13 }}>
          {notice}
        </p>
      ) : null}

      {screen === 'dash' ? (
        <WatchDashboard
          rows={rows}
          now={NOW}
          actions={{
            onConfirmAlive: () =>
              setNotice('「無事です」を送信しました（代理確認）'),
            onCannotReach: () => setScreen('death'),
          }}
        />
      ) : null}

      {screen === 'death' ? (
        <DeathConfirm
          subjectName="佐藤 健太"
          votesFor={1}
          livingWatchers={2}
          graceHours={48}
          onAlive={() => setNotice('無事の報告（代理確認）が全員に届きます')}
          onUnknown={() => {
            setScreen('dash');
            setNotice('');
          }}
          onConfirm={() => setNotice('この先に、慎重な確認ステップが続きます')}
        />
      ) : null}

      {screen === 'msg' ? (
        packed ? (
          <MessageDisclosure
            fromName="健太"
            hint="最初に飼った犬の名前（デモ: ポチ）"
            {...packed}
          />
        ) : (
          <p style={{ textAlign: 'center', color: 'var(--ink-3)' }}>準備中…</p>
        )
      ) : null}
    </div>
  );
}
