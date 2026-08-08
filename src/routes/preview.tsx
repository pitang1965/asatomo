import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { DashboardRow } from '../domain/queries';
import { encryptText, generateDek, wrapDek } from '../web/crypto';
import { DeathConfirm } from '../web/DeathConfirm';
import { MessageDisclosure } from '../web/MessageDisclosure';
import { WatchDashboard } from '../web/WatchDashboard';

/**
 * 見守りWeb のプレビュー画面（モックデータ、DB不要）。デザイン確認用に残す。
 * 実データ画面はトップ（/）で、こちらはログインせずに全画面を見られる。
 * 「最後の伝言」は実際に暗号化 → 合言葉「ポチ」で本物の復号が走る（ゼロ知識のデモ）。
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
    appLoggedOutAt: ago(30),
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
    appLoggedOutAt: null,
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
    appLoggedOutAt: null,
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
    appLoggedOutAt: null,
    isAlert: false,
  },
];

type Screen = 'dash' | 'death' | 'msg';
type Packed = {
  messageId: string;
  ciphertext: string;
  iv: string;
  wrappedDek: string;
};

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
      setPacked({ messageId: 'demo', ciphertext, iv, wrappedDek });
    })();
  }, []);

  const tab = (id: Screen, label: string) => (
    <Button
      type="button"
      variant={screen === id ? 'default' : 'secondary'}
      onClick={() => {
        setScreen(id);
        setNotice('');
      }}
      className="h-auto rounded-full px-3.5 py-2 text-[13px] font-semibold"
    >
      {label}
    </Button>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <Link
          to="/"
          className="text-sm font-semibold text-muted-foreground hover:underline"
        >
          ← ホームへ
        </Link>
        <span className="text-xs text-(--ink-3)">デモ画面・サンプルデータ</span>
      </header>

      <nav className="flex flex-wrap justify-center gap-2 p-4">
        {tab('dash', 'ダッシュボード')}
        {tab('death', '死亡確認')}
        {tab('msg', '最後の伝言')}
      </nav>

      {notice ? (
        <p className="text-center text-[13px] text-(--good)">{notice}</p>
      ) : null}

      {screen === 'dash' ? (
        <WatchDashboard
          rows={rows}
          now={NOW}
          actions={{
            onConfirmAlive: () =>
              setNotice('「無事です」を送信しました（代理確認）'),
            onCannotReach: () => setScreen('death'),
            onLeaveWatch: (_id, name) =>
              setNotice(`${name}さんの見守りをやめました（プレビュー）`),
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
            messages={[packed]}
          />
        ) : (
          <p className="text-center text-(--ink-3)">準備中…</p>
        )
      ) : null}
    </div>
  );
}
