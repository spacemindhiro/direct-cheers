# Direct Cheers — 統合テスト仕様書

> **最終更新:** 2026-06-01（TC-ENT 入場チケット・TC-IDEM 冪等性テスト追加・ギャップ分析追記）  
> **対象ブランチ:** develop  
> **テストランナー:** Vitest 4.x

---

## 0. テストギャップ分析（QA視点）

### 0-1. テストカバレッジサマリー

| テストファイル | 対象モジュール | ケース数 | 主なリスク |
|---------------|--------------|---------|-----------|
| pay-cheers.test.ts | /api/pay/cheers | 13 | 決済手段 × Capability マトリクス |
| settle.test.ts | /api/events/[eventId]/settle | 8 | 分配精度・フロー分岐 |
| settle-flow.test.ts | end → reconcile → settle | 8 | 後半戦一気通貫 |
| refund.test.ts | /api/admin/refund | 5 | 5パターン返金ロジック |
| payout.test.ts | /api/payout/request | 3 | 出金・残高照会 |
| chargeback.test.ts | /api/stripe/webhook | 3 | チャージバック処理 |
| tax.test.ts | fee-config / 計算ロジック | 9 | 端数精度 |
| **entrance.test.ts** | /api/entrance/reserve, checkin | **11** | **入場チケット全体（新規）** |
| **idempotency.test.ts** | /api/pay/complete, webhook | **5** | **二重課金・重複処理（新規）** |
| **合計** | | **~65** | |

### 0-2. テストギャップ一覧と優先度

| 優先度 | 領域 | ギャップ内容 | 対応状況 |
|--------|------|-------------|---------|
| ★★★ 高 | 入場チケット予約・チェックイン | `/api/entrance/` が完全未テスト。在庫切れ、タイプA/B/C分岐、ALREADY_USED等 | **→ TC-ENT で解消** |
| ★★★ 高 | 決済完了の冪等性 | `/api/pay/complete` の二重呼び出し（同一PI→同一tx）が未テスト | **→ TC-IDEM で解消** |
| ★★★ 高 | Webhook 重複配信 | 同一`stripe_event_id`の2回配信をスキップする冪等チェック | **→ TC-IDEM-C で解消** |
| ★★ 中 | 価格上限バリデーション | スタンダード3000円/メッセージ5000円/入場30000円の上限がAPI側で未検証（フロントのみ） | 未実装（バックエンドに制約なし） |
| ★★ 中 | レースコンディション | 残1枚チケットへの同時予約（`reserve_product_stock` の排他ロック効果） | 未実装（DB RPC 直接テストで要対応） |
| ★★ 中 | イベントライフサイクル状態チェック | `settled`済みイベントへのcancel/endなど「順番違い操作」の拒否 | 一部 TC-POST-PAY-01-F でカバー |
| ★ 低 | カスタムプラン（上限10万円） | 実装未済のため後回し | スコープ外 |
| ★ 低 | Apple Pay / Google Pay リアル決済 | Stripe テストモード非対応のためモックのみ | TC-PAY-MATRIX でカバー済み |

### 0-3. バックエンドにない価格バリデーションの注意点

`/api/pay/cheers` は `amount` パラメータを **そのまま Stripe に渡す**。
上限チェック（3,000円 / 5,000円 / 30,000円）は現在フロントエンドのみの制御。
API に直接リクエストを送れば上限超えの決済が作れる。将来的にバックエンドでの検証を推奨。

### 0-4. 残存テストギャップ（将来対応）

```
- TC-RACE: reserve_product_stock の同時呼び出しでのオーバーセル防止検証
- TC-PRICE: スタンダード/メッセージ/入場の金額上限をバックエンドで実装後にテスト
- TC-LIFECYCLE: イベント状態マトリクス（published/ended/settled × cancel/end/settle の全掛け算）
- TC-WEBHOOK-RETRY: タイムアウト後のリトライで重複処理が起きないことの網羅
```

---

## 1. テスト環境の座組み

| レイヤー | 方針 |
|----------|------|
| テストランナー | Vitest 4（ESM ネイティブ、Next.js / Stripe SDK v20 と互換） |
| Stripe | **モックしない**。`STRIPE_SECRET_KEY=sk_test_*` でテストモード API を実際に呼ぶ |
| Stripe Connect アカウント（テスト用） | **Custom タイプ**で作成する（環境制約・後述） |
| Supabase | **モックしない**。`supabase start` で起動したローカル Docker DB を使う |
| Next.js server utils | `@/lib/supabase/server`（`createClient`, `getUser`）のみ `vi.mock` でダミー返却 |
| `next/headers` | `vi.mock` でダミー返却（テスト環境に Request context がないため） |

### 環境制約: Stripe Connect アカウントのタイプ

テスト fixture（`stripe-fixtures.ts`）では Connect アカウントを **Custom タイプ** で作成している。

プロダクションで使用するのは **Express タイプ** だが、Express アカウントは Stripe のホスト型オンボーディング（本人確認フロー）を経ないと `transfers` capability が Active にならない。Stripe の API は Express アカウントへの `tos_acceptance` セットを明示的に禁止している（`controller[requirement_collection]=stripe` のアカウントには ToS を代理受諾できない）。

Custom タイプであれば API で `tos_acceptance` を渡すことで capability を即時 Active にできるため、テスト用途に採用した。決済ロジック（destination charge、transfer、reversal）はアカウントタイプに依存しないため、テストの有効性に影響しない。

### 実行モード

- **直列実行**（`singleFork: true`）— Stripe レートリミット対策・DB 競合防止
- タイムアウト: テスト 60 秒 / フック 60 秒
- `.env.test` を dotenv で自動ロード

---

## 2. 事前準備

### 2-1. 環境変数の設定

`.env.test` に以下を記入（初回のみ）:

```
STRIPE_SECRET_KEY=sk_test_YOUR_KEY          ← Stripe ダッシュボード > 開発者 > API キー
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_KEY
STRIPE_WEBHOOK_SECRET=whsec_YOUR_SECRET     ← webhook テスト時のみ必要

NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=...           ← supabase start の出力を貼る
SUPABASE_SERVICE_ROLE_KEY=...               ← supabase start の出力を貼る

NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

> ローカル Supabase のデフォルトキーは `.env.test` に初期値として記載済み。  
> 独自 JWT secret を設定している場合は `supabase status` の出力値に差し替える。

### 2-2. ローカル Supabase の起動

```bash
supabase start     # Docker が必要
supabase status    # キーと URL を確認
```

### 2-3. テストの実行

```bash
npm test                    # 全テスト（1回実行）
npm run test:watch          # ファイル変更監視モード
npm run test:coverage       # カバレッジ付き実行
npx vitest run __tests__/integration/tax.test.ts   # 特定ファイルのみ
```

> **TC-TAX のみ** Stripe / DB 不要。他のテストは Stripe テストモードとローカル DB が必要。

---

## 3. ファイル構成

```
__tests__/
├── helpers/
│   ├── db-reset.ts         テーブルごとのクリーンアップ・testAdmin クライアント
│   ├── stripe-fixtures.ts  Connect アカウント作成・PI 作成・Capture・Transfer ヘルパー
│   └── seed.ts             DB レコード挿入ヘルパー（profiles, events, transactions 等）
└── integration/
    ├── pay-cheers.test.ts  TC-PAY    /api/pay/cheers（TC-PAY-05 は settle.test.ts 内に配置）
    ├── settle.test.ts      TC-SETTLE /api/events/[eventId]/settle（TC-PAY-05 含む）
    ├── refund.test.ts      TC-REFUND /api/admin/refund（返金5パターン）
    ├── payout.test.ts      TC-PAYOUT /api/payout/request
    ├── chargeback.test.ts  TC-CB       /api/stripe/webhook（dispute イベント）
    ├── tax.test.ts         TC-TAX      手数料計算・端数処理（純ロジック）
    ├── settle-flow.test.ts TC-POST-PAY  イベント終了→照合→審査ロック→Settle 一気通貫
    ├── entrance.test.ts    TC-ENT       入場チケット予約・チェックイン・権限チェック
    └── idempotency.test.ts TC-IDEM      二重課金防止・webhook重複配信・冪等性
```

---

## 4. テストケース一覧

### TC-PAY — /api/pay/cheers（Checkout Session 作成）

| ID | タイトル | アサーション |
|----|----------|-------------|
| TC-PAY-01 | カード決済・MoR 移転フロー | `payment_intent_data.on_behalf_of = organizerConnectId`、`capture_method = "manual"`。`transfer_data` / `application_fee_amount` は**設定しない**（settle 時に source_transaction Transfer で分配）|
| TC-PAY-02 | PayPay 決済 | `on_behalf_of` が **undefined**（PayPay は Connect の on_behalf_of 非対応）。`capture_method = "automatic"` |
| TC-PAY-03 | オーガナイザーに Connect アカウントなし | `on_behalf_of` なしで Session が正常作成される |
| TC-PAY-04 | 必須フィールド欠損 | HTTP 400 が返る |
| TC-PAY-05 | SavedCard off_session オーソリ → settle 完走 | SetupIntent でカード登録 → off_session PI（capture_method=manual）→ settle ロジックがキャプチャし agent/org/artist に1円単位で3者分配 |

**アーキテクチャ注記（TC-PAY-01）:**
```
現行実装は Separate Charges & Transfers（Full Pool）設計。
Checkout Session 作成時点では transfer_data / application_fee_amount を設定しない。
全額 platform に着金し、settle API が source_transaction Transfer で各受取人へ分配する。
on_behalf_of のみ設定することで Stripe 明細上の MoR をオーガナイザーに移転する。
```

**TC-PAY-05 計算根拠（gross=10,000、agent+org50%+artist50%）:**
```
stripe_fee = 396, platform_fee = 1000, net = 8604
agent  = floor(10000 × 0.05) = 500
org    = floor(8604 × 0.5)  = 4302
artist = floor(8604 × 0.5)  = 4302
合計   = 9104 = net（プラットフォームは platform_fee=1000 を黙示的回収）
```

---

### TC-PAY-MATRIX-V2 — 全決済手段 × Capability状態マトリクス

> `vi.mock("stripe")` 内の `InstrumentedStripe` が `checkout.sessions.create` と
> `accounts.retrieve` の両方をインターセプト。`captured.accountCapabilities` を
> テストごとに書き換えることで Capability 状態を注入する。

| ID | 決済手段 | Capability状態 | 期待結果 |
|----|----------|----------------|---------|
| TC-PAY-MATRIX-01 | card | active | 200。`on_behalf_of = organizerConnectId`、`capture_method = "manual"`、`payment_method_types = ["card"]` |
| TC-PAY-MATRIX-02 | apple_pay | active | 200。Apple Pay は Stripe 上 card type。`payment_method_types = ["card"]`、`on_behalf_of` あり |
| TC-PAY-MATRIX-03 | google_pay | active | 200。Google Pay も card type。TC-MATRIX-02 と同一コードパス |
| TC-PAY-MATRIX-04 | link | active | 200。`payment_method_types = ["card", "link"]`、`on_behalf_of` あり |
| TC-PAY-MATRIX-05 | paypay | — (チェック対象外) | 200。`on_behalf_of = undefined`、`capture_method = "automatic"` |
| TC-PAY-MATRIX-06a | card | `card_payments: "pending"` | **422** `account_incomplete`。`missing_capabilities` に `card_payments`。`checkout.sessions.create` は**呼ばれない** |
| TC-PAY-MATRIX-06b | card | `transfers: "inactive"` | **422** `account_incomplete`。`missing_capabilities` に `transfers` |
| TC-PAY-MATRIX-06c | paypay | `card_payments: "pending"` + `transfers: "inactive"` | **200**（PayPay は Capability チェック対象外） |

**決済手段ごとの処理マッピング:**
```
payment_method   payment_method_types   on_behalf_of   capture_method   Capabilityチェック
card             ['card']               あり            manual           あり
apple_pay        ['card']               あり            manual           あり
google_pay       ['card']               あり            manual           あり
link             ['card', 'link']       あり            manual           あり
paypay           ['paypay']             なし            automatic        なし（Connect非対応）
```

**Capability チェックの実装（`lib/stripe-check.ts`）:**
```typescript
// checkConnectCapabilities(stripe, connectId, required?)
// required のデフォルト = ['card_payments', 'transfers']
// → stripe.accounts.retrieve でアカウント状態を取得し
//   required の各ケイパビリティが "active" でなければ
//   { ok: false, missing: [...] } を返す
// → route.ts がこれを受けて 422 / account_incomplete を返し
//   Stripe への Checkout Session 作成電文を送らずブロックする
```

---

### TC-SETTLE — /api/events/[eventId]/settle（決済キャプチャ・送金）

| ID | タイトル | アサーション |
|----|----------|-------------|
| TC-SETTLE-01 | source_transaction Transfer フロー | organizer・artist それぞれに `source_transaction` Transfer が作成され `settle_transfers` に記録される。`transactions.destination_transfer_id` は NULL（destination charge は使用しない） |
| TC-SETTLE-03 | エージェント手数料 | `transaction_distributions` に agent 行（`actual_amount = floor(gross × 0.05)`）が作成される。`settle_transfers` にも agent 分の source_transaction Transfer が存在する |
| TC-SETTLE-04 | 未確定アーティスト → オーガナイザー帰属 | `event_artists.status = "pending"` のアーティストへの配分が organizer に振り替えられる |
| TC-SETTLE-05 | 二重 settle 防止 | HTTP 400 `Already settled` |
| TC-SETTLE-06 | 照合差異・再精算（分割精算の総額一致） | 15,000円 精算 + 5,000円 差分精算 の合計が 20,000円 一括精算と1円単位で完全一致する。差分精算の分配率が正確に適用される |
| TC-SETTLE-07 | PayPay 即時キャプチャ済み PI のセトルメント | `capture_method: "automatic"` で confirm 済み（succeeded）の PI を使用。settle ロジックがキャプチャをスキップし、`source_transaction` で3者分配する。PayPay 手数料（4.378% = 3.98% × 消費税1.1）を適用 |

**source_transaction Transfer フロー（現行アーキテクチャ）:**
```
全ロール（organizer / artist / agent）とも source_transaction: chargeId を指定した Transfer を使用。
platform の available 残高に依存しない。platform 手数料は黙示的回収（gross - 全送金合計）。

transactions.destination_transfer_id は NULL（destination charge は使わない設計に変更済み）
```

**TC-SETTLE-07 計算根拠（gross=10,000、PayPay手数料 4.378%、agent+org50%+artist50%）:**
```
stripe_fee  = floor(10000 × 0.04378) = 437   ← 3.98% × 1.1（消費税込み実質レート）
platform_fee = floor(10000 × 0.10)   = 1000
net          = 10000 - 437 - 1000    = 8563
agent  = floor(10000 × 0.05)         = 500
org    = floor(8563 × 0.5)           = 4281
artist = floor(8563 × 0.5)           = 4281
```

**TC-SETTLE-06 再精算の計算根拠:**
```
gross=20,000 → stripeFee=792, platformFee=2000, net=17208, agent=1000, org=8604, artist=8604
gross=15,000 → stripeFee=594, platformFee=1500, net=12906, agent=750,  org=6453, artist=6453
gross= 5,000 → stripeFee=198, platformFee= 500, net= 4302, agent=250,  org=2151, artist=2151

org: 6453+2151=8604 ✓  artist: 6453+2151=8604 ✓  agent: 750+250=1000 ✓
```

---

---

### TC-REFUND — /api/admin/refund（返金実行）

| ID | タイトル | アサーション |
|----|----------|-------------|
| TC-REFUND-01 | 非admin → 403 Forbidden | organizer ロールで POST → 403 |
| TC-REFUND-02 | オーソリ中（requires_capture）→ cancel | PI.status=canceled、TX.status=cancelled |
| TC-REFUND-03 | キャプチャ後・settle前 + COMPASSIONATE | refund 実行。settle_transfer なし（totalReversed=0）。debt_claims に stripe_fee が記録される |
| TC-REFUND-04 | キャプチャ後・settle後 + FULL_PENALTY | 全 settle_transfer を逆転（totalReversed=settle額）。debt_claims に platform_fee が記録される |
| TC-REFUND-05 | キャプチャ後・settle後 + COMPASSIONATE | 全 settle_transfer を逆転（同上）。debt_claims に stripe_fee が記録される |

**5パターンの処理分岐:**
```
1. requires_capture                → PI cancel（資金移動ゼロ）
2. succeeded + settle前 FULL_PENALTY    → refund + debt_claims(platform_fee 10%)
3. succeeded + settle前 COMPASSIONATE   → refund + debt_claims(stripe_fee ~4%)
4. succeeded + settle後 FULL_PENALTY    → refund + 全transfer逆転(按分) + debt_claims(platform_fee)
5. succeeded + settle後 COMPASSIONATE   → refund + 全transfer逆転(按分) + debt_claims(stripe_fee)
```

**プラットフォーム損益（gross=10,000 の場合）:**
```
settle後 FULL_PENALTY:
  refund: -10000, 逆転回収: +9104, debt(platform_fee): +1000 → net = 500 - 10000 + 9104 + 1000 = +604
settle後 COMPASSIONATE:
  refund: -10000, 逆転回収: +9104, debt(stripe_fee): +396  → net = 500 - 10000 + 9104 + 396  = 0 (完全無傷)
settle前 COMPASSIONATE:
  refund: -10000, debt(stripe_fee): +396                   → net = 9604 - 10000 + 396 = 0 (完全無傷)
```

**debt_claims フィールド:**
```
profile_id              = organizer の profile_id
original_transaction_id = 対象トランザクション
claim_amount            = FULL_PENALTY: platform_fee / COMPASSIONATE: stripe_fee
status                  = 'active'（回収時に 'recovered' に更新）
```

---

### TC-PAYOUT — /api/payout/request（出金申請）

| ID | タイトル | アサーション |
|----|----------|-------------|
| TC-PAYOUT-01 | organizer 出金（新フロー） | `payout_requests` が作成される。`stripe_transfer_id` が `po_*` で始まる。`stripe_fee_deducted = 500`。振込手数料は destination transfer の Reversal で回収される |
| TC-PAYOUT-02 | agent 出金（旧フロー） | `settle_transfers` の Transfer を Reversal して ¥500 を回収。出金成功 |
| TC-PAYOUT-03 | GET 残高照会 | `available` / `pending` / `frozen` / `history` / `transfer_fee` / `hold_days` が返る |

**出金可能条件（全て満たす必要あり）:**
```
distribution_status = 'accrued'
is_frozen = false
deleted_at IS NULL
hold_released = true  OR  created_at < NOW() - 14日
reconciled_at IS NOT NULL
amount_verified != false
amount_mismatch = 0
```

**振込手数料回収ロジック（ロール別）:**

| ロール | 新フロー | 旧フロー |
|--------|----------|----------|
| organizer | destination transfer を Reversal | settle_transfers を Reversal |
| artist | sub-transfer Reversal → organizer に戻る → destination transfer Reversal でさらに platform へ | settle_transfers を Reversal → 不足分は organizer の settle_transfer から |
| agent | settle_transfers を Reversal（常に同じ） | — |

---

### TC-CB — /api/stripe/webhook（チャージバック処理）

| ID | タイトル | アサーション |
|----|----------|-------------|
| TC-CB-01 | dispute.created — 基本フロー | `transaction_distributions.is_frozen = true`（accrued + paid 両方）。`debt_claims` が 1 件作成される。`paid` な distribution に対応する `settle_transfers` が Reversal される |
| TC-CB-01-冪等 | 同一 dispute の二重配信 | `debt_claims` の件数が増えない |
| TC-CB-03 | dispute.closed（won）— 勝訴 | `transaction_distributions.is_frozen = false` に解除。`debt_claims.status = 'closed_won'` に更新 |

**Stripe の実挙動（重要）:**
- Stripe はチャージバック発生時に **platform 口座から自動で没収する**
- **destination transfer は Stripe が自動 Reversal しない** → システムが手動で `stripe.transfers.createReversal()` を呼ぶ
- Connect 残高が ¥0 で Reversal 失敗時 → `Balance insufficient` エラーを try-catch で捕捉し、500 を返さず処理継続
- `handle_chargeback` RPC が DB レベルの冪等チェック（`stripe_dispute_id` ユニーク制約）を持つ

**webhook モック:**
```typescript
vi.mock("stripe", ...) で stripe.webhooks.constructEvent を
署名検証なしで JSON.parse(body) を返すように上書き
```

---

### TC-ENT — 入場チケットシステム（`entrance.test.ts`）

> `/api/entrance/reserve`（予約作成）と `/api/entrance/checkin`（チェックイン）の全体を網羅。
> **タイプA/B/C の仕様分岐・在庫管理・状態遷移・権限チェックはここで担保する。**

#### TC-ENT-A: 予約バリデーション

| ID | タイトル | アサーション |
|----|----------|-------------|
| TC-ENT-A-01 | product_id 欠損 | HTTP 400 |
| TC-ENT-A-02 | customer_email 欠損 | HTTP 400 |
| TC-ENT-A-03 | 存在しない product_id | HTTP 404 Product not found |
| TC-ENT-A-04 | 在庫切れ（sold_count=stock_limit）| HTTP 409 `SOLD_OUT` |

#### TC-ENT-B: タイプB予約（Checkout Session）

| ID | タイトル | アサーション |
|----|----------|-------------|
| TC-ENT-B-01 | タイプB正常予約 | HTTP 200、`type="B"`、`url` が checkout.stripe.com で始まる |

#### TC-ENT-C: タイプA予約（SetupIntent / 5日前直接オーソリ）

| ID | タイトル | アサーション |
|----|----------|-------------|
| TC-ENT-C-01 | タイプA（開催14日前）→ SetupIntentパス | `is_auth=false`、`client_secret` あり、DB に `entrance_reservations` が `pending` で作成 |
| TC-ENT-C-02 | タイプA（開催3日前）→ 直接オーソリパス | `is_auth=true`、`client_secret` あり（PI）、`reservation_id` あり |

**タイプA 5日分岐の設計:**
```
開催まで > 5日: SetupIntent（カード保存） → cronが5日前に off_session PI を作成
開催まで ≤ 5日: PaymentIntent(capture_method=manual) を直接作成 → その場でオーソリ
```

#### TC-ENT-D: チェックイン正常系

| ID | タイトル | アサーション |
|----|----------|-------------|
| TC-ENT-D-01 | 有効チケット（タイプB）のチェックイン | HTTP 200、`ok=true`、DB で `tickets.status="used"`、`checked_in_at` がセット |

#### TC-ENT-E: チェックイン異常系

| ID | タイトル | アサーション |
|----|----------|-------------|
| TC-ENT-E-01 | 使用済みチケット | HTTP 409 `ALREADY_USED` |
| TC-ENT-E-02 | キャンセル済みチケット | HTTP 409 `TICKET_CANCELLED` |
| TC-ENT-E-03 | 存在しないチケットコード | HTTP 404 `TICKET_NOT_FOUND` |
| TC-ENT-E-04 | ticket_code 欠損 | HTTP 400 |

#### TC-ENT-F: チェックイン権限チェック

| ID | タイトル | アサーション |
|----|----------|-------------|
| TC-ENT-F-01 | 未認証（ログアウト状態） | HTTP 401 Unauthorized |
| TC-ENT-F-02 | 他イベントのオーガナイザー | HTTP 403 Forbidden |

**チェックインの状態遷移:**
```
valid  → [checkin_ticket RPC] → used（正常）
used   → 409 ALREADY_USED（ルート層で事前チェック）
cancelled → 409 TICKET_CANCELLED（ルート層で事前チェック）
```

**Stripe モック方針（entrance.test.ts）:**
```
customers.create / setupIntents.create / paymentIntents.create / checkout.sessions.create
をすべてモックし、実Stripe API を呼ばない。
理由: カード情報なしでは成功しないフロー（タイプCチェックイン等）があるため。
```

---

### TC-IDEM — 冪等性・二重課金防止（`idempotency.test.ts`）

> リアルイベント会場の不安定な通信を想定した「二重課金・重複処理」防止ロジックの網羅。

#### TC-IDEM-A: /api/pay/complete バリデーション

| ID | タイトル | アサーション |
|----|----------|-------------|
| TC-IDEM-A-01 | session_id 欠損 | HTTP 400、`error` に "session_id" が含まれる |
| TC-IDEM-A-02 | payment_status=unpaid かつ PI.status=requires_payment_method | HTTP 400 `Payment not completed` |

#### TC-IDEM-B: /api/pay/complete 二重呼び出し

| ID | タイトル | アサーション |
|----|----------|-------------|
| TC-IDEM-B-01 | 既存 PI の tx が DB にある状態で再呼び出し | HTTP 200、返却 `transaction_id` = 既存 id（新規作成なし）、DB の同 PI の tx 件数 = 1 |
| TC-IDEM-B-02 | requires_capture（manual capture）PI でも同じく冪等 | HTTP 200、既存 transaction_id を返す |

**冪等性の実装ロジック:**
```typescript
// pay/complete/route.ts
const { data: existing } = await admin.from("transactions")
  .select("transaction_id, ...")
  .eq("stripe_payment_intent_id", pi?.id ?? "")
  .maybeSingle();

if (existing) {
  return buildResponse(...);  // ← 既存行を返して終了（二重書き込みなし）
}
// 新規の場合のみ RPC complete_cheers_payment を呼ぶ
```

#### TC-IDEM-C: Stripe Webhook 重複配信

| ID | タイトル | アサーション |
|----|----------|-------------|
| TC-IDEM-C-01 | 同一 stripe_event_id を2回送信 | 1回目 200。2回目も 200。`webhook_processed_events` の件数が増加しない |

**webhook 冪等チェックの実装:**
```typescript
// /api/stripe/webhook/route.ts
const { data: alreadyProcessed } = await admin
  .from("webhook_processed_events")
  .select("id")
  .eq("stripe_event_id", event.id)
  .maybeSingle();

if (alreadyProcessed) return NextResponse.json({ received: true }); // スキップ
```

**Stripe モック方針（idempotency.test.ts）:**
```typescript
// module スコープの captured に fakePiId を持たせ、
// checkout.sessions.retrieve をインターセプト → 任意の PI id / status を返す
// webhook テストは署名検証をバイパス（TC-CB と同じパターン）
```

---

### TC-POST-PAY — 後半戦一気通貫シナリオ（`settle-flow.test.ts`）

> 決済完了後の「イベント終了 → ログ照合 → 開催審査ロック → Settle（分配）」フローの
> カバレッジ。前半（招待〜決済）のテスト網羅に対し、**後半フローの防衛網**として追加。

#### TC-POST-PAY-01: 一気通貫パイプライン

| サブケース | 検証内容 | アサーション |
|------------|----------|-------------|
| A. イベント終了 | `/api/events/[eventId]/end` → `lifecycle_status = "ended"` | HTTP 200、DB で `ended` を確認 |
| B. StripeログとDB照合 | `/api/admin/reconcile/event` → succeeded PI の `amount_received` と DB gross が一致 | `amount_verified=true`、`amount_mismatch=0`、`reconciled_at` が NULL でない、`reconciliation_logs` が記録される |
| C. エビデンスなし → settle ブロック | エビデンス未提出状態で settle を呼ぶ | HTTP 400 `No evidence submitted`（出金不可） |
| D. Settle 実行・分配精度 | エビデンス提出後に settle → agent+org+artist の Transfer 額が1円単位で正確 | `agentTransfer.amount = floor(gross×0.05)`、`orgTransfer.amount = floor(net×0.5)`、`artistTransfer.amount = floor(net×0.5)`、合計一致 |
| E. チャージバック待機期間ロック | Settle 後の distributions の状態確認 | 全行 `distribution_status = "accrued"`（出金前ロック）、`dist合計 = Transfer合計` |
| F. 二重 settle ブロック | settle済みイベントに再度 settle | HTTP 400 `Already settled` |

**TC-POST-PAY-01 計算根拠（gross=20,000、agent+org50%+artist50%）:**
```
stripe_fee   = floor(20000 × 0.0396) = 792
platform_fee = floor(20000 × 0.10)   = 2000
net          = 20000 - 792 - 2000    = 17208
agent  = floor(20000 × 0.05) = 1000
org    = floor(17208 × 0.5)  = 8604
artist = floor(17208 × 0.5)  = 8604
合計   = 1000 + 8604 + 8604  = 18208
```

#### TC-POST-PAY-02: 照合差分検知

| ID | タイトル | アサーション |
|----|----------|-------------|
| TC-POST-PAY-02 | StripeとDB金額不一致を検知 | DB gross=9,000 / Stripe amount_received=10,000 → `amount_verified=false`、`amount_mismatch=1000`、`reconciled_at` はセット（照合自体は完了記録） |

#### TC-POST-PAY-03: 多者分配精度検証

| ID | タイトル | アサーション |
|----|----------|-------------|
| TC-POST-PAY-03 | 4者分配（agent+org+artist1+artist2）端数誤差ゼロ | org=50% / artist1=30% / artist2=20% の QR。Transfer合計 ≤ NET+AGENT。NET+AGENT との差 < 10円（Math.floor 端数分のみ） |

**使用 Stripe フィクスチャ:** `createTestCapturedPaymentIntent`（`capture_method: "automatic"`, succeeded 状態）
— 照合ルートが `requires_capture` をスキップするため、**succeeded PI を使用することで照合が実際に走る**

---

### TC-TAX — 手数料計算・端数処理（Stripe/DB 不要）

| ID | タイトル | アサーション |
|----|----------|-------------|
| TC-TAX-01 | カード手数料の基本計算（¥10,000） | stripeFee=396, platformFee=1000, netAmount=8604, appFee=1396 |
| TC-TAX-02 | 端数が出る金額での一貫性（7パターン） | `net + appFee <= gross`、差は最大 1 円、全値が整数 |
| TC-TAX-03 | エージェント手数料 | `floor(gross × 0.05)` = 1000（gross=20000 の場合） |
| TC-TAX-04 | PayPay 手数料 | stripeFee=437（floor(10000 × 0.04378)）、net=8563 |
| TC-TAX-05 | 消費税逆算 | `actual - floor(actual / 1.1)` = 910（actual=10000 の場合） |
| TC-TAX-06 | fee-config フォールバック | DB 接続失敗時にデフォルト値を返す。`getNetRate` / `fmtPct` の動作検証 |
| TC-TAX-07 | PayPay 手数料の消費税上乗せ（9ケース） | `3.98% × 1.1 = 4.378%` の法的根拠を明示。`paypay_rate > card_rate`、`paypay_net_rate = 0.85622`（5桁精度）、5金額での恒等式、消費税差額検証 |

**TC-TAX-07 法的根拠（PayPay 手数料への消費税上乗せ）:**
```
Stripe カード手数料（3.6%）: 金融取引として消費税法上の非課税取引
PayPay 決済手数料（3.98%）: 課税取引 → 消費税（10%）が上乗せされる

実質手数料 = 3.98% × 1.1 = 4.378%  ← fee-config の paypay_rate に反映済み
paypay_net_rate = 1 - 0.04378 - 0.10 = 0.85622（Math.round × 100000 で5桁精度）
```

**恒等式（必ず成立させること）:**
```
net_amount + application_fee_amount ≤ gross
gross - (net_amount + application_fee_amount) ≤ 1  ← Math.floor による最大誤差
```

---

## 5. 各ヘルパーの使い方

### db-reset.ts

```typescript
import { cleanupTestData, testAdmin } from "../helpers/db-reset";

afterAll(async () => {
  await cleanupTestData({
    profileIds: [...],
    eventIds: [...],
    transactionIds: [...],
    distributionIds: [...],
    // ...
  });
});
```

### stripe-fixtures.ts

```typescript
import {
  createTestConnectAccount,   // Express アカウント作成 → accountId
  deleteTestConnectAccount,   // afterAll でのクリーンアップ
  createTestPaymentIntent,    // requires_capture な PI を作成（destination charge）
  captureAndGetDestinationTransfer, // PI をキャプチャして destination_transfer_id を返す
  createTestTransfer,         // platform → Connect の直接 Transfer（旧フロー・残高作成用）
  retrieveRecentCheckoutSession,    // qr_config_id メタデータで最新 Session を検索
} from "../helpers/stripe-fixtures";
```

### seed.ts

```typescript
import {
  insertProfile,          // (role, displayName, email, stripeConnectId?) → profileId
  insertEvent,            // (organizerProfileId, agentId?, title?) → eventId
  insertQrConfig,         // (eventId, recipientProfileId) → qrConfigId
  insertQrConfigTargets,  // (qrConfigId, [{profileId, ratio}])
  insertTransaction,      // (qrConfigId, gross, net, fee, piId, ...) → txId
  insertDistribution,     // (txId, eventId, profileId, role, amount, ...) → distId
  insertEventArtist,      // (eventId, artistProfileId, status?)
  insertEventEvidence,    // (eventId, submittedByProfileId) → evidenceId
  insertSettleTransfer,   // (eventId, profileId, stripeTransferId, amount)
} from "../helpers/seed";
```

---

## 6. モックパターン

### createClient のモック（admin ロール固定）

```typescript
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";

(createClient as any).mockResolvedValue({
  auth: {
    getUser: vi.fn().mockResolvedValue({
      data: { user: { id: "YOUR_TEST_ADMIN_UUID" } },
      error: null,
    }),
  },
  from: vi.fn((table: string) => {
    if (table === "profiles") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { role: "admin" } }),
      };
    }
    return testAdmin.from(table); // 他のテーブルは本物の DB
  }),
});
```

### Stripe accounts.retrieve の Capability 注入（pay-cheers.test.ts）

```typescript
// module スコープの captured オブジェクトに accountCapabilities を持たせる
const captured: {
  sessionCreateParams?: any;
  accountCapabilities: Record<string, string>;
} = {
  accountCapabilities: { card_payments: "active", transfers: "active" }, // デフォルト: 正常
};

// InstrumentedStripe の constructor 内で accounts.retrieve をインターセプト
(this.accounts as any).retrieve = async (id: string) => ({
  id,
  object: "account",
  capabilities: captured.accountCapabilities,
});

// 異常系テストでは afterEach でリセット
afterEach(() => {
  captured.accountCapabilities = { card_payments: "active", transfers: "active" };
  captured.sessionCreateParams = undefined;
});

// 個別テスト内で Capability 不足を注入
captured.accountCapabilities = { card_payments: "pending", transfers: "active" };
// → route.ts が 422 / account_incomplete を返す
// → captured.sessionCreateParams が undefined のままであることで「電文未送信」を証明
```

### webhook の署名検証バイパス

```typescript
vi.mock("stripe", async (importOriginal) => {
  const StripeModule = (await importOriginal()) as any;
  const OrigStripe = StripeModule.default ?? StripeModule;
  class MockStripe extends OrigStripe {
    webhooks = {
      ...super.webhooks,
      constructEvent: (body: string) => JSON.parse(body),
    };
  }
  return { default: MockStripe, ...StripeModule };
});
```

---

## 7. 注意事項・既知の制約

- **Stripe Express アカウントの削除:** `stripe.accounts.del(id)` は削除を即時反映しない場合がある。`afterAll` での削除失敗は無視してよい（テストモードなので残存しても無害）
- **Stripe レートリミット:** `singleFork: true` で直列実行しているが、テスト数が増えた場合は `setTimeout` ではなく Stripe の Retry-After ヘッダーを確認すること
- **ローカル DB のリセット:** `supabase db reset` は全データを消去するため、テスト中に実行しないこと
- **webhook 冪等チェック:** `webhook_processed_events` テーブルに同一 `stripe_event_id` が残っていると再テストが通らない。各テストで `beforeAll` に削除を入れること
- **TC-SETTLE の requires_capture PI:** Stripe テストモードの PI は 7 日で期限切れになる。テストは毎回新規に PI を作成するので問題なし
- **PayPay / Link テスト（TC-PAY-02, TC-PAY-MATRIX-04/05）:** Stripe テストモードに PayPay・Link のサンドボックスが提供されていないため、`InstrumentedStripe` 内で `checkout.sessions.create` をスタブ化してパラメータ検証のみを行う。実 API は呼ばれない
- **Capability チェックのモック:** `accounts.retrieve` を常にインターセプトするため、テストモードの Connect アカウント（Custom タイプ）の実際の capability 状態に依存しない。`captured.accountCapabilities` で完全制御する
