# 設計: 死亡認定の状態遷移フロー（タスク#2）

[ADR-0001](../adr/0001-death-certification-authorization-model.md) の権限モデル・不変条件A〜D・エスカレーションのタイミングを、**Cron（時間駆動）と API（イベント駆動）**にどう実装するかの設計。スキーマ（`subject_settings.state` / `death_certifications` / `death_votes`）を動かす仕様。

> 記号: 🕒=Cronが駆動 / 📩=APIイベントが駆動 / 🔒=安全の床（アプリ層で強制）

---

## 1. 状態（`monitoring_state`）

| 状態 | 意味 | 見守り者は煩わされるか |
|---|---|---|
| `normal` | 正常。シグナルが判定窓内に届いている | されない |
| `unresponsive` | 判定窓超過。**本人にのみ**再通知済み（段階1） | されない |
| `watchers_alerted` | 見守り者へ「連絡してみて」通知済み（段階2）。確認中 | される（ソフト） |
| `voting` | 見守り者の誰かが死亡投票を開始。**全見守り者に投票要請** | される（深刻） |
| `certified_grace` | クォーラム成立・猶予期間中。**最後の可逆点** | される |
| `disclosed` | 開示済み。**不可逆の終点**（不変条件C） | — |

`normal` を離れると `death_certifications` に1エピソードが open する（`death_cert_one_active_idx` で本人につき1本）。

---

## 2. 遷移表

| # | From → To | 駆動 | 条件（ガード） | アクション |
|---|---|---|---|---|
| T1 | normal → unresponsive | 🕒 | `last_signal_at + detection_window < now` かつ 旅行モード外 | エピソードopen / 本人へプッシュ再通知（段階1） |
| T2 | unresponsive → watchers_alerted | 🕒 | 段階1から `段階1→2遅延`(既定12h) 経過・無シグナル | 見守り者へLINE/メール（段階2） |
| T3 | watchers_alerted → voting | 📩 | 見守り者が死亡投票を開始（最初の1票） | 全見守り者へ投票要請通知 |
| T4 | voting → certified_grace | 📩→評価 | **クォーラム成立**（§4）かつ 🔒段階2から最低12h経過 | `grace_until = now + grace` を設定 / 本人へ強い通知 |
| T5 | certified_grace → disclosed | 🕒 | `grace_until < now` かつ 未キャンセル | 開示（受取人へ通知・復号可能化）/ `outcome=disclosed` |
| **A** | (disclosed以外) → normal | 📩 | **本人の生存シグナル到達**（不変条件A） | エピソードを `cancelled_by_signal` で閉じ、`last_signal_at`更新 |
| **A'** | certified_grace → normal | 📩 | **本人のワンタップ取消**（猶予中） | `cancelled_by_subject`。本人へ確認 |
| **B** | voting → watchers_alerted/normal | 📩 | 投票取り下げで定足数割れ / 代理確認で解決 | §3参照。`cancelled_by_withdrawal` 等 |
| **D** | (任意) 開示ロック | 📩/🕒 | 有効見守り者 < 2（辞退・休眠） | `disclosure_enabled=false` / 本人へ「もう1人必要」通知 |

**重要な非対称**（ADR-0001の安全原則）:
- 自動で `normal` へ戻せるのは **A（本人の直接シグナル）** と **A'（本人の取消）** のみ。
- 見守り者の **代理確認（B）** は自動で警報を消さない。「知らせる」だけ（§3）。

---

## 3. 代理確認と懸念フラグの扱い（不変条件B）

- **代理確認（attestation）**: 見守り者が「生きているのを確認した」と申告。`voting` 中でも**自動で投票を打ち切らない**。全投票者に可視化し、各自が票を取り下げられる。全票が取り下げられ定足数を割ったら `voting → watchers_alerted`（またはエピソード解決）。
- **代理確認によるエピソード解決**: 見守り者が確認し警報が収まった場合、エピソードを解決し `normal` へ戻す。このとき `last_signal_at = 代理確認時刻` に**前進させる**（直後の再トリガーを防ぐため）。ただし「代理確認による解決」と記録し全見守り者に可視化する（怠慢・偽証言を沈黙させない。Q3の決定）。
- **懸念フラグ（concern flag）**: 純粋な受取人が上げる。**状態は変えない**。全見守り者への通知＋本人への再ping に留める（承認権限は与えない。ADR-0001）。

---

## 4. クォーラム判定アルゴリズム（T4の評価）

投票が入る/取り下げられるたび、または段階2の床経過時に評価する。

```
living_watchers = accepted な見守り者のうち、
                  watcher_last_seen_at が 休眠しきい値(既定14日) 以内の者
active_dead_votes = 当該エピソードで withdrawn_at IS NULL の票
成立条件:
  count(active_dead_votes) >= 2
  AND count(active_dead_votes) > count(living_watchers) / 2   // 過半数
  AND (now - watchers_alerted_at) >= 12h                       // 🔒安全の床
```

- **休眠見守り者は分母（living_watchers）から自動除外**。除外は全見守り者に可視化。
- 全員一致は要求しない（音信不通1人でのデッドロック回避）。
- 有効見守り者が2人未満に落ちたら成立不能＝実質ロック（不変条件D）。

---

## 5. Cron 設計（Cloudflare Cron Triggers・無料枠5個以内）

**方針: 時間駆動の遷移を1本のCronに集約**（枠を節約）。約15分間隔を推奨。

**Cron①「監視tick」（*/15）** — 1回の実行で以下を順に処理:
1. **T1スキャン**: `subject_settings` を `subject_settings_scan_idx (state, last_signal_at)` で引き、`state=normal` かつ旅行モード外かつ判定窓超過 → unresponsive化＋本人プッシュ。
2. **T2スキャン**: `state=unresponsive` かつ段階1→2遅延超過 → watchers_alerted化＋見守り者通知。
3. **T5スキャン**: `death_certifications` を `death_cert_grace_idx (outcome, grace_until)` で引き、`in_progress` かつ `certified_grace` かつ `grace_until < now` → 開示。

**サブリクエスト上限（50/呼び出し）対策**: 1tickで処理する対象をバッチ上限で区切り、超過分は次tickへ繰り越す（優先度: T5開示 > T2アラート > T1）。

### Neon障害フォールバック（安全原則の system 版）
Neon Free はアイドルで scale-to-zero＋コールドスタート500ms〜2s、コンピュート上限到達でサスペンド。**安全システムが黙って止まるのは最悪**。

- **リトライ**: DB接続をバックオフ付きで数回リトライ（コールドスタート吸収）。
- **失敗時の直送**: なお失敗するなら、**運営者へ直送通知**（管理用LINE/メール/Webhook）で「監視tickが劣化」を知らせる。エンドユーザーはDB無しに列挙できないため、まず*システム稼働自体*の可視化を優先。
- **将来のhardening**（要検討）: 猶予期限（`grace_until`）など**クリティカルな締切だけ Workers KV にミラー**し、Neon不通でもT5開示/重要アラートを撃てるようにする。MVPでは入れない。

---

## 6. API（イベント駆動の遷移）

| エンドポイント | 呼ぶ人 | 効果 |
|---|---|---|
| `POST /signals` | 本人アプリ / Webチェックイン | シグナル記録＋`last_signal_at`更新。**不変条件A**: エピソードが open なら `cancelled_by_signal` で閉じ normal へ |
| `POST /subjects/me/travel` | 本人 | 旅行モード設定（🔒上限日数・期限付き）。見守り者へ可視化通知。解除もここ |
| `POST /watch/{subject}/vote` | 見守り者 | 死亡投票の投下/取り下げ → T3/§4評価 → T4 |
| `POST /watch/{subject}/attest` | 見守り者 | 代理確認記録＋全見守り者へ可視化（§3） |
| `POST /watch/{subject}/concern` | 純粋な受取人 | 懸念フラグ記録＋見守り者通知（状態不変） |
| `POST /subjects/me/cancel` | 本人 | 猶予中のワンタップ取消（A'） |
| `POST /connections/*` | 本人 | つながり招待/承諾/取消。承諾/辞退時に `disclosure_enabled` 再計算（不変条件D） |

`POST /signals` は最頻・最重要（不変条件A）。Better Auth のセッショントークンで本人を特定し、必ず**エピソードのキャンセル判定**を通す。

---

## 7. テキスト状態図

```
             🕒T1(判定窓超過)        🕒T2(+12h)         📩T3(投票開始)
  ┌────────┐ ───────────────▶ ┌──────────────┐ ─────────▶ ┌──────────────┐ ───▶ ┌────────┐
  │ normal │                   │ unresponsive │            │watchers_alert│      │ voting │
  └────────┘ ◀───────────────  └──────────────┘ ◀───────── └──────────────┘ ◀─── └────────┘
      ▲   ▲   A(本人シグナル/全状態から)           B(取り下げ・代理確認で定足数割れ)      │ 📩T4
      │   │                                                                          │ §4クォーラム+🔒12h
      │   └──────────── A'(本人取消) ────────────┐                                    ▼
      │                                          │                          ┌────────────────┐
      └────── A(本人シグナル) ────────────────────┴───────────────────────── │ certified_grace│
                                                                            └────────────────┘
                                                                                    │ 🕒T5(grace_until超過)
                                                                                    ▼
                                                                            ┌────────────┐
                                                                            │ disclosed  │ (不可逆)
                                                                            └────────────┘
```

---

## 8. 確定した数値（既定値・2026-07-14 確定。後から調整可）

- 段階1→2遅延: 既定 **12h**（6〜24h）
- 投票成立の床: **12h**（段階2から）
- 猶予: 既定 **48h**（24〜72h・本人調整）
- 判定窓: 既定 **30h**（18〜48h・本人調整）
- 休眠しきい値: 既定 **14日**（これ以上応答の無い見守り者は定足数の分母から除外）
- Cron間隔: **15分**
- 懸念フラグ: 状態を変えない（見守り者通知のみ）
- 代理確認による解決: `last_signal_at` を前進させる（可視化・ログ化。§3）
- Neon障害: リトライ → 運営者直送。KVミラーは v2（§5）
