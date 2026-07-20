# TODO

プロダクトのフォローアップ課題。ADR にするほど重くない（可逆・驚き小）決定や、
グリルで発見した実装ギャップを軽く記録する。

## 「見守りをやめる」導線が無い（Web）

- 発見: 2026-07-20（見守り者ゼロ時コピーの実機確認中、ゼロに戻す手段が無く判明）
- 事実: `revokeWatcher`（本人が見守り者を外す）はドメイン＋API（[POST /connections/revoke](src/api/router.ts)、[handlers.ts](src/api/handlers.ts) `revokeWatcher`）まで在るが、**UI がどこにも無い**。見守り者が「自分から降りる」方向は**そもそも無い**（revoke は本人所有アクション）。
- 置き場所: **Web**（[ADR-0006](docs/adr/0006-platform-seam-frequency.md): 頻度で線を引く。つながり管理は稀・管理的＝Web の担当。日常の Android には持ち込まない）。
- 安全: 解除は安全網を減らす行為。`revokeWatcher` は開示ロックの再計算（不変条件D）を済ませている。見守り者が「自分から降りる」を作る場合は、黙って安全網が減らないよう**本人へ通知**する（CONTEXT の「沈黙より通知」）。
- テスト実務メモ: 現状ゼロ状態を作るには DB で該当 `connections` 行の `watcher_status` を `revoked` にする（Drizzle Studio / Neon いずれも同一DB）。
