import type { SignalKind } from '../domain/monitoring';

/**
 * 「近況」の文言整形。見守り者に見せるのは過去形＋相対的な経過時間だけ（近況の定義）。
 * リアルタイムの「今〇〇中」や絶対時刻は使わない＝監視感を出さない。
 */

const VERB: Record<SignalKind, string> = {
  alarm_dismiss: 'アラームを止めました',
  meal: '食事をしました',
  sleep: '就寝しました',
  app_open: 'アプリを開きました',
  device_unlock: 'スマホを使いました',
  web_checkin: 'チェックインしました',
};

export function relativeJa(from: Date, now: Date): string {
  const min = Math.floor((now.getTime() - from.getTime()) / 60000);
  if (min < 1) return 'たった今';
  if (min < 60) return `約${min}分前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `約${h}時間前`;
  return `${Math.floor(h / 24)}日前`;
}

export function recentActivityText(
  kind: SignalKind | null,
  at: Date | null,
  now: Date,
): string {
  if (!kind || !at) return 'まだ活動がありません';
  const rel = relativeJa(at, now);
  const verb = VERB[kind];
  return rel === 'たった今' ? `たった今${verb}` : `${rel}に${verb}`;
}
