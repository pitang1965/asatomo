import type { SignalKind } from './monitoring';

/**
 * 「近況」の文言整形。見守り者に見せるのは過去形＋相対的な経過時間だけ（近況の定義）。
 * リアルタイムの「今〇〇中」や絶対時刻は使わない＝監視感を出さない。
 * Web とアプリ（/api/watch/overview）で共用する単一実装（ADR-0006: ぼかしの二重実装回避）。
 */

const VERB: Record<SignalKind, string> = {
  alarm_dismiss: 'アラームを止めました',
  meal: '食事をしました',
  sleep: '就寝しました',
  app_open: 'アプリを開きました',
  device_unlock: 'スマホを使いました',
  web_checkin: 'チェックインしました',
  // 「いってきます」は留守（家が無人）の開示になるためぼかす（記録は outing のまま。CONTEXT.md 近況）。
  outing: '元気にしていました',
  homecoming: '帰ってきました',
};

export function relativeJa(from: Date, now: Date): string {
  const min = Math.floor((now.getTime() - from.getTime()) / 60000);
  if (min < 1) return 'たった今';
  // 1時間未満は分単位を出さず「さっき」に丸める。5分前でも40分前でも意味は
  // 「ついさっき元気だった」で同じ。分単位は安全価値ゼロで監視感だけ足す（近況の粒度）。
  if (min < 60) return 'さっき';
  const h = Math.floor(min / 60);
  // 時間スケールの精度（2h か 20h か）は残す。経過時間で異常を測る本アプリでは
  // 心配な見守り者の安心・段階感に効くため。日単位は経過時間ベース（暦の「昨日」は使わない）。
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
  // 「たった今」「さっき」は助詞「に」を付けない（「さっきに」は不自然）。
  return rel === 'たった今' || rel === 'さっき'
    ? `${rel}${verb}`
    : `${rel}に${verb}`;
}

/**
 * 本人が自分の履歴を見るときの真の種別ラベル（ぼかさない）。見守り者向けの VERB とは別物で、
 * 外出も「いってきます」と正直に見せる（透明性: 自分のデータに何が記録されているかを隠さない）。
 */
const TRUE_LABEL: Record<SignalKind, string> = {
  alarm_dismiss: 'アラームを止めました',
  meal: '「ごはん」を送りました',
  sleep: '「おやすみ」を送りました',
  app_open: 'アプリを開きました',
  device_unlock: 'スマホを使いました',
  web_checkin: 'Webでチェックインしました',
  outing: '「いってきます」を送りました',
  homecoming: '「ただいま」を送りました',
};

export function signalTrueLabel(kind: SignalKind): string {
  return TRUE_LABEL[kind];
}

/**
 * 本人の履歴用の絶対時刻表示（「M月D日 HH:mm」）。近況の相対・ぼかし表示とは別で、
 * 自分のデータなので絶対時刻でよい（絶対時刻を出さないのは見守り者向け近況のルール）。
 */
export function absoluteJa(at: Date): string {
  const m = at.getMonth() + 1;
  const d = at.getDate();
  const hh = String(at.getHours()).padStart(2, '0');
  const mm = String(at.getMinutes()).padStart(2, '0');
  return `${m}月${d}日 ${hh}:${mm}`;
}
