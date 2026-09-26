/**
 * アサトモ SQLite スキーマ（Drizzle ORM / Cloudflare D1）
 *
 * このファイルは CONTEXT.md の用語集と docs/adr/ の決定を、そのままテーブルへ写像したもの。
 * 用語 → テーブルの対応:
 *   本人(Subject)             → user + subjectSettings
 *   つながり(Connection)      → connections（有向エッジ。見守り/受取の性質を載せる）
 *   見守り者(Watcher)         → connections.isWatcher = true（役割はつながりの上の属性）
 *   受取人(Recipient)         → messageRecipients（伝言の宛先から派生。固定ロールではない）
 *   生存シグナル(Liveness)     → signals
 *   代理確認(Attestation)     → attestations
 *   最後の伝言(FinalMsg)      → legacyMessages + messageRecipients
 *   合言葉(Passphrase)        → 保存しない（ゼロ知識）。hint と wrappedDek のみ保持
 *   死亡認定(Certification)   → deathCertifications + deathVotes
 *   旅行モード(TravelMode)     → subjectSettings.travelUntil
 *   近況/プレゼンス            → signals から算出 / subjectSettings.currentPresence
 *   相互見守り(Mutual)         → 2 本の connections（双方向）
 *   招待(Invitation)          → invitations（相手未確定の申し出。承諾で connections へ昇格。ADR-0005）
 *
 * 安全に関わる規則は「アプリ層で強制」する（DB制約ではない）:
 *   - クォーラム（見守り者2人以上・過半数）と休眠除外       … ADR-0001
 *   - 判定窓/猶予の安全の床（本人でも外せない下限）         … ADR-0001
 *   - 旅行モードの上限日数・可視化・自動復帰                 … 旅行モード決定
 *   - 合言葉・DEK の暗号化/復号は端末側（サーバは平文を持たない）… ADR-0002
 *
 * SQLiteには列挙型が無いため、Postgres時代のpgEnumは `text(..., { enum: [...] })` に、
 * uuid は `text` + `crypto.randomUUID()`、timestamp(withTimezone) は `integer(mode:'timestamp')`
 * （unix秒）、boolean は `integer(mode:'boolean')` に対応させている（docs/adr/0012 参照）。
 */

import { relations, sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

// ────────────────────────────────────────────────────────────────────────────
// Enums（SQLiteには無いので text(..., { enum: [...] }) の値集合として定義）
// ────────────────────────────────────────────────────────────────────────────

/** 生存シグナルの種別（本人が自分で発する直接証拠）。判定は時刻でなく経過時間ベース。 */
const signalKindValues = [
  'alarm_dismiss', // アラーム停止
  'meal', // 「ごはん」ボタン
  'sleep', // 「寝る」ボタン
  'app_open', // アプリ起動
  'device_unlock', // 端末ロック解除（任意）
  'web_checkin', // Webからのチェックイン（Android非所持の本人。ダッシュボード表示で自動記録）
  'outing', // 「いってきます」ボタン（外出。近況ではぼかして見せる — CONTEXT.md 近況）
  'homecoming', // 「ただいま」ボタン（帰宅）
  'wake', // 「おはよう」ボタン（起床）
] as const;

/** 見守り者の招待状態（見守りは責務なので承諾が要る。純粋な受取人には不要）。 */
const watcherStatusValues = [
  'pending', // 招待済み・未承諾
  'accepted', // 承諾（見守り者として有効）
  'declined', // 辞退
  'revoked', // 本人が取消 / 見守り者が離脱
] as const;

/** 死亡認定の状態機械（正常 → … → 開示）。ADR-0001。 */
const monitoringStateValues = [
  'normal', // 正常
  'unresponsive', // 未応答（本人へ再通知済み）
  'watchers_alerted', // 見守り者へ「連絡してみて」通知済み
  'voting', // 投票中
  'certified_grace', // 認定成立・猶予期間中（最後の可逆点）
  'disclosed', // 開示済み（不可逆の終点。不変条件C）
] as const;

/** 内部判定用の一時的プレゼンス。見守り者にはリアルタイム露出しない（近況のみ）。 */
const presenceStateValues = ['none', 'eating', 'sleeping'] as const;

/** 死亡認定エピソードの結末。 */
const certificationOutcomeValues = [
  'in_progress', // 進行中（1本のみ active）
  'cancelled_by_signal', // 本人の生存シグナルで中断（不変条件A）
  'cancelled_by_subject', // 猶予中に本人がワンタップ取消（A'）
  'cancelled_by_withdrawal', // 投票取り下げ等で定足数割れ
  'resolved_by_attestation', // 見守り者の代理確認で解決（誰が確認したかは attestations に記録）
  'disclosed', // 開示に到達
] as const;

// ────────────────────────────────────────────────────────────────────────────
// 認証（Better Auth 管理）— ⚠ 手編集禁止
//   `@better-auth/cli generate`（scripts/auth-cli-config.ts）の出力を反映した正式版。
//   生成結果どおり timestamp_ms（unixミリ秒、DB側デフォルト）を使う（他テーブルは
//   integer(mode:'timestamp')=unix秒。ここだけ生成ツールに合わせて意図的に異なる）。
//   auth 設定を変えたら再生成して差分をここに写すこと。
//   アサトモは DB 分離（ADR-0003）のため、自前の auth テーブルを持つ。
// ────────────────────────────────────────────────────────────────────────────

// created_at/updated_at のDB側デフォルト（`npx @better-auth/cli generate`の出力どおり）。
const authNowDefault = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' })
    .notNull()
    .default(false),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(authNowDefault),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(authNowDefault)
    .$onUpdate(() => new Date()),
});

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(authNowDefault),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [index('session_userId_idx').on(t.userId)],
);

export const account = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    providerId: text('provider_id').notNull(), // google / facebook / line(genericOAuth) …
    accountId: text('account_id').notNull(), // プロバイダ側のユーザーID（sub）
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', {
      mode: 'timestamp_ms',
    }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', {
      mode: 'timestamp_ms',
    }),
    scope: text('scope'),
    password: text('password'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(authNowDefault),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [index('account_userId_idx').on(t.userId)],
);

export const verification = sqliteTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(authNowDefault),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(authNowDefault)
      .$onUpdate(() => new Date()),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
);

// ────────────────────────────────────────────────────────────────────────────
// 本人の見守り設定 + 状態（subjectSettings）
//   「本人（見守られる側）」になった user につき 1 行。cron の未シグナルscan の起点。
// ────────────────────────────────────────────────────────────────────────────

export const subjectSettings = sqliteTable(
  'subject_settings',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),

    // 判定窓・猶予は本人が調整可。ただし安全の床（下限）はアプリ層で強制する（ADR-0001）。
    detectionWindowHours: integer('detection_window_hours')
      .notNull()
      .default(30), // 既定30h（18〜48h）
    gracePeriodHours: integer('grace_period_hours').notNull().default(48), // 既定48h（24〜72h）

    // cron 高速scan用に非正規化（signals から更新）。
    lastSignalAt: integer('last_signal_at', { mode: 'timestamp' }),

    // 状態機械の現在地（ADR-0001）。
    state: text('state', { enum: monitoringStateValues })
      .notNull()
      .default('normal'),
    stateChangedAt: integer('state_changed_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),

    // 内部判定用プレゼンス（見守り者には露出しない）。
    currentPresence: text('current_presence', { enum: presenceStateValues })
      .notNull()
      .default('none'),
    presenceSince: integer('presence_since', { mode: 'timestamp' }),

    // 旅行モード: 期限付き・自動復帰。null = 通常監視。可視化はアプリ層。上限日数もアプリ層で強制。
    travelUntil: integer('travel_until', { mode: 'timestamp' }),
    travelStartedAt: integer('travel_started_at', { mode: 'timestamp' }),

    // 本人アプリからのログアウト。null = ログイン中（または未使用）。
    // 沈黙を情報に変えるための可視化であり、監視・エスカレーションは抑制しない（ADR-0006 の文脈）。
    // アプリ発のシグナル受信でクリア（ログインし直して使い始めた証拠）。
    appLoggedOutAt: integer('app_logged_out_at', { mode: 'timestamp' }),

    // 開示可否のキャッシュ（= 承諾済み見守り者が2人以上か。ADR-0001）。権威はアプリ層の再計算。
    disclosureEnabled: integer('disclosure_enabled', { mode: 'boolean' })
      .notNull()
      .default(false),

    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    // 「未シグナルscan」用: state が normal で、lastSignalAt が古い本人を効率よく拾う。
    scanIdx: index('subject_settings_scan_idx').on(t.state, t.lastSignalAt),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// つながり（connections）— 有向エッジ。見守り/受取の性質を載せる
//   subjectUserId（本人）が otherUser もしくは externalEmail を自分のサークルに加えた 1 レコード。
//   相互見守りは (A→B) と (B→A) の 2 レコードで表現する。
// ────────────────────────────────────────────────────────────────────────────

export const connections = sqliteTable(
  'connections',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    subjectUserId: text('subject_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),

    // 相手。登録ユーザー（見守り者 or アプリ利用の受取人）なら otherUserId、
    // メールだけの純粋な受取人なら externalEmail（アカウント不要）。どちらか一方のみ。
    // 相手ユーザーが[[アカウント削除]]されたらこのエッジは消える（cascade）。set null にすると
    // externalEmail も null になり connections_party_ck（user XOR email）に違反するため cascade で正す
    // （ADR-0007。アプリ層の削除手順が漏らしても DB 単体で自己整合になる belt-and-suspenders）。
    otherUserId: text('other_user_id').references(() => user.id, {
      onDelete: 'cascade',
    }),
    externalEmail: text('external_email'),
    displayName: text('display_name').notNull(), // 本人が付ける表示名

    // 見守る役割（見守り者）を持つか。持つと死亡認定の投票権を得る（ADR-0001）。
    // 純粋な受取人は false（懸念フラグは上げられるが投票不可）。
    isWatcher: integer('is_watcher', { mode: 'boolean' })
      .notNull()
      .default(false),
    watcherStatus: text('watcher_status', { enum: watcherStatusValues }), // isWatcher の時のみ意味を持つ
    watcherLastSeenAt: integer('watcher_last_seen_at', {
      mode: 'timestamp',
    }), // 休眠判定用（分母から自動除外）

    // 合言葉（ADR-0002）: 合言葉そのものは保存しない。任意のヒントのみ（平文）。受取人ごとの属性。
    passphraseHint: text('passphrase_hint'),

    invitedAt: integer('invited_at', { mode: 'timestamp' }),
    respondedAt: integer('responded_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    // 相手はユーザーかメールのどちらか一方（両方nullや両方設定は不可）。
    partyCk: check(
      'connections_party_ck',
      sql`(${t.otherUserId} is not null) <> (${t.externalEmail} is not null)`,
    ),
    // 同じ本人×同じユーザーの重複つながりを禁止。
    uniqUserParty: uniqueIndex('connections_subject_other_uniq')
      .on(t.subjectUserId, t.otherUserId)
      .where(sql`${t.otherUserId} is not null`),
    subjectIdx: index('connections_subject_idx').on(t.subjectUserId),
    watcherIdx: index('connections_watcher_idx').on(
      t.subjectUserId,
      t.isWatcher,
      t.watcherStatus,
    ),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// 招待（invitations）— 相手が未確定の「開いた申し出」（ADR-0005）
//   トークン付きリンクで送る。承諾で connections（相互見守りなら2本）へ昇格する。
//   使い切り（consumedAt）・期限付き（expiresAt）・取消可（revokedAt）。
//   有効な招待 = consumedAt/revokedAt が null かつ expiresAt が未来。派生状態はアプリ層で判定。
// ────────────────────────────────────────────────────────────────────────────

export const invitations = sqliteTable(
  'invitations',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    token: text('token').notNull().unique(), // URLセーフ乱数（アプリ生成）
    inviterUserId: text('inviter_user_id') // 見守り者が欲しい本人（招待者）
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    // 使い切り: 承諾で設定。誰が承諾したかも記録（監査・重複承諾の冪等化）。
    consumedAt: integer('consumed_at', { mode: 'timestamp' }),
    consumedByUserId: text('consumed_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    revokedAt: integer('revoked_at', { mode: 'timestamp' }), // 招待者の取消
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    inviterIdx: index('invitations_inviter_idx').on(t.inviterUserId),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// 生存シグナル（signals）— 本人が発する直接証拠
//   オフライン時は端末側キューイング → 再接続時に同期するため、occurredAt(端末) と receivedAt(サーバ) を分離。
// ────────────────────────────────────────────────────────────────────────────

export const signals = sqliteTable(
  'signals',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    subjectUserId: text('subject_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: signalKindValues }).notNull(),
    occurredAt: integer('occurred_at', { mode: 'timestamp' }).notNull(), // 端末側の発生時刻
    receivedAt: integer('received_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()), // サーバ受信時刻
    source: text('source'), // 端末/アプリ情報（任意）
  },
  (t) => ({
    // 「最後のシグナル」参照 & 近況表示用。
    subjectTimeIdx: index('signals_subject_time_idx').on(
      t.subjectUserId,
      t.occurredAt,
    ),
  }),
);

// アラーム設定はサーバに持たない（MVP）。
//   アラームは端末の AlarmManager.setAlarmClock で完結し、停止時に signals(kind='alarm_dismiss')
//   を送るだけ。判定は経過時間ベースで時刻非依存のためサーバはアラーム時刻を必要としない。
//   「就寝→翌朝アラーム予測」を後日入れるなら subjectSettings に nextExpectedSignalAt を追加する。

// ────────────────────────────────────────────────────────────────────────────
// 本人向けプッシュ通知トークン（FCM HTTP v1）
// ────────────────────────────────────────────────────────────────────────────

export const pushTokens = sqliteTable(
  'push_tokens',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    fcmToken: text('fcm_token').notNull().unique(),
    platform: text('platform').notNull().default('android'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    userIdx: index('push_tokens_user_idx').on(t.userId),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// 死亡認定エピソード（deathCertifications）— 1 エピソードの監査記録
//   state が normal を離れたら 1 本 open。votes はここに紐づく。
// ────────────────────────────────────────────────────────────────────────────

export const deathCertifications = sqliteTable(
  'death_certifications',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    subjectUserId: text('subject_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    startedAt: integer('started_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    stage: text('stage', { enum: monitoringStateValues })
      .notNull()
      .default('unresponsive'),
    graceUntil: integer('grace_until', { mode: 'timestamp' }), // 認定成立時に設定（猶予期限）
    outcome: text('outcome', { enum: certificationOutcomeValues })
      .notNull()
      .default('in_progress'),
    cancelReason: text('cancel_reason'),
    cancelledAt: integer('cancelled_at', { mode: 'timestamp' }),
    disclosedAt: integer('disclosed_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    // 本人につき in_progress は 1 本のみ（アプリ層 + この部分ユニークで担保）。
    oneActive: uniqueIndex('death_cert_one_active_idx')
      .on(t.subjectUserId)
      .where(sql`${t.outcome} = 'in_progress'`),
    graceIdx: index('death_cert_grace_idx').on(t.outcome, t.graceUntil), // 猶予期限scan用
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// 死亡認定の投票（deathVotes）— 見守り者のみ。取り下げ可（不変条件B）
// ────────────────────────────────────────────────────────────────────────────

export const deathVotes = sqliteTable(
  'death_votes',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    certificationId: text('certification_id')
      .notNull()
      .references(() => deathCertifications.id, { onDelete: 'cascade' }),
    voterUserId: text('voter_user_id') // 見守り者（アプリ層で isWatcher/accepted を検証）
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    withdrawnAt: integer('withdrawn_at', { mode: 'timestamp' }), // 取り下げ（代理確認等を見て）
  },
  (t) => ({
    // 1 エピソード×1 見守り者につき 1 票。
    uniqVote: uniqueIndex('death_votes_uniq').on(
      t.certificationId,
      t.voterUserId,
    ),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// 代理確認（attestations）— 見守り者の間接証拠。覆さないが知らせる（不変条件B）
//   全見守り者に可視化する監査記録。日常の汎用シグナル源にはしない。
// ────────────────────────────────────────────────────────────────────────────

export const attestations = sqliteTable(
  'attestations',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    subjectUserId: text('subject_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    attesterUserId: text('attester_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    certificationId: text('certification_id').references(
      () => deathCertifications.id,
      {
        onDelete: 'set null',
      },
    ), // エスカレーション中なら紐づく
    note: text('note'), // 任意の根拠メモ（例:「14:00にDiscord投稿を確認」）
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    subjectIdx: index('attestations_subject_idx').on(
      t.subjectUserId,
      t.createdAt,
    ),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// 懸念フラグ（concernFlags）— 純粋な受取人が上げる「連絡が取れない」。投票権の代替
//   見守り者のエスカレーションを起動するだけ。承認権限は与えない（ADR-0001）。
// ────────────────────────────────────────────────────────────────────────────

export const concernFlags = sqliteTable(
  'concern_flags',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    subjectUserId: text('subject_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    raisedByConnectionId: text('raised_by_connection_id')
      .notNull()
      .references(() => connections.id, { onDelete: 'cascade' }),
    note: text('note'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    subjectIdx: index('concern_flags_subject_idx').on(
      t.subjectUserId,
      t.createdAt,
    ),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// 最後の伝言（legacyMessages）— ゼロ知識暗号化（ADR-0002）
//   サーバは暗号文しか持たない。復号は端末側で合言葉から。運営者は平文を読めない。
// ────────────────────────────────────────────────────────────────────────────

export const legacyMessages = sqliteTable(
  'legacy_messages',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    subjectUserId: text('subject_user_id') // 作成者（本人）
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    encryptedLabel: text('encrypted_label').notNull(), // base64。見出しも暗号化（運営者は読めない）
    ciphertext: text('ciphertext').notNull(), // base64。暗号化された本文（サーバは読めない）
    cipherAlgo: text('cipher_algo').notNull().default('AES-GCM'),
    iv: text('iv').notNull(), // base64 nonce
    // DEK を「本人自身の鍵」で包んだもの。本人が生前いつでも本文/見出しを読み書きするため（ADR-0002）。
    // 受取人向けの wrappedDek は messageRecipients 側。運営者はどの鍵も持たない＝ゼロ知識。
    authorWrappedDek: text('author_wrapped_dek').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    subjectIdx: index('legacy_messages_subject_idx').on(t.subjectUserId),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// 伝言の宛先（messageRecipients）— 伝言 ⇄ 受取人 の多対多 + 受取人ごとの暗号材料
//   「受取人」はここから派生する動的状態（宛先変更で増減）。個別=1件 / 全員=つながり全件。
//   グループ宛はv2（質問6）。wrappedDek は合言葉由来鍵で包んだ DEK（ADR-0002）。
// ────────────────────────────────────────────────────────────────────────────

export const messageRecipients = sqliteTable(
  'message_recipients',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    messageId: text('message_id')
      .notNull()
      .references(() => legacyMessages.id, { onDelete: 'cascade' }),
    connectionId: text('connection_id') // 宛先の受取人（= つながり）
      .notNull()
      .references(() => connections.id, { onDelete: 'cascade' }),
    wrappedDek: text('wrapped_dek').notNull(), // base64。合言葉由来鍵で包んだデータ鍵
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    uniqTarget: uniqueIndex('message_recipients_uniq').on(
      t.messageId,
      t.connectionId,
    ),
    connIdx: index('message_recipients_conn_idx').on(t.connectionId),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// Relations（Drizzle relational queries 用）
// ────────────────────────────────────────────────────────────────────────────

export const userRelations = relations(user, ({ one, many }) => ({
  subjectSettings: one(subjectSettings, {
    fields: [user.id],
    references: [subjectSettings.userId],
  }),
  connectionsOwned: many(connections, { relationName: 'subject_connections' }),
  signals: many(signals),
  legacyMessages: many(legacyMessages),
}));

export const subjectSettingsRelations = relations(
  subjectSettings,
  ({ one }) => ({
    user: one(user, {
      fields: [subjectSettings.userId],
      references: [user.id],
    }),
  }),
);

export const connectionsRelations = relations(connections, ({ one, many }) => ({
  subject: one(user, {
    fields: [connections.subjectUserId],
    references: [user.id],
    relationName: 'subject_connections',
  }),
  other: one(user, {
    fields: [connections.otherUserId],
    references: [user.id],
  }),
  messageTargets: many(messageRecipients),
}));

export const deathCertificationsRelations = relations(
  deathCertifications,
  ({ one, many }) => ({
    subject: one(user, {
      fields: [deathCertifications.subjectUserId],
      references: [user.id],
    }),
    votes: many(deathVotes),
    attestations: many(attestations),
  }),
);

export const deathVotesRelations = relations(deathVotes, ({ one }) => ({
  certification: one(deathCertifications, {
    fields: [deathVotes.certificationId],
    references: [deathCertifications.id],
  }),
  voter: one(user, { fields: [deathVotes.voterUserId], references: [user.id] }),
}));

export const legacyMessagesRelations = relations(
  legacyMessages,
  ({ one, many }) => ({
    subject: one(user, {
      fields: [legacyMessages.subjectUserId],
      references: [user.id],
    }),
    recipients: many(messageRecipients),
  }),
);

export const messageRecipientsRelations = relations(
  messageRecipients,
  ({ one }) => ({
    message: one(legacyMessages, {
      fields: [messageRecipients.messageId],
      references: [legacyMessages.id],
    }),
    connection: one(connections, {
      fields: [messageRecipients.connectionId],
      references: [connections.id],
    }),
  }),
);
