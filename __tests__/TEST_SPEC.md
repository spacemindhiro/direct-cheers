# Direct Cheers — 統合テスト仕様書

> **最終更新:** 2026-05-31  
> **対象ブランチ:** develop  
> **テストランナー:** Vitest 4.x

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
    ├── chargeback.test.ts  TC-CB     /api/stripe/webhook（dispute イベント）
    └── tax.test.ts         TC-TAX    手数料計算・端数処理（純ロジック）
```

---

## 4. テストケース一覧

### TC-PAY — /api/pay/cheers（Checkout Session 作成）

| ID | タイトル | アサーション |
|----|----------|-------------|
| TC-PAY-01 | カード決済・destination charge フロー | Session の PI に `on_behalf_of`, `transfer_data.destination`, `application_fee_amount` が設定されている |
| TC-PAY-02 | PayPay 決済 | PI に `on_behalf_of` が設定されない（destination charge なし） |
| TC-PAY-03 | オーガナイザーに Connect アカウントなし | `application_fee_amount` が null でも Session が正常作成される |
| TC-PAY-04 | 必須フィールド欠損 | HTTP 400 が返る |
| TC-PAY-05 | SavedCard off_session オーソリ → settle 完走 | SetupIntent でカード登録 → off_session PI（capture_method=manual）→ settle ロジックがキャプチャし agent/org/artist に1円単位で3者分配 |

**手数料計算（TC-PAY-01）:**
```
application_fee_amount = floor(gross × platform_rate) + floor(gross × stripe_rate)
                       = floor(10000 × 0.10) + floor(10000 × 0.0396)
                       = 1000 + 396 = 1396
organizer 受取 = gross - application_fee_amount = 10000 - 1396 = 8604
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

### TC-SETTLE — /api/events/[eventId]/settle（決済キャプチャ・送金）

| ID | タイトル | アサーション |
|----|----------|-------------|
| TC-SETTLE-01 | source_transaction Transfer フロー | organizer・artist それぞれに `source_transaction` Transfer が作成され `settle_transfers` に記録される。`transactions.destination_transfer_id` は NULL（destination charge は使用しない） |
| TC-SETTLE-03 | エージェント手数料 | `transaction_distributions` に agent 行（`actual_amount = floor(gross × 0.05)`）が作成される。`settle_transfers` にも agent 分の source_transaction Transfer が存在する |
| TC-SETTLE-04 | 未確定アーティスト → オーガナイザー帰属 | `event_artists.status = "pending"` のアーティストへの配分が organizer に振り替えられる |
| TC-SETTLE-05 | 二重 settle 防止 | HTTP 400 `Already settled` |
| TC-SETTLE-06 | 照合差異・再精算（分割精算の総額一致） | 15,000円 精算 + 5,000円 差分精算 の合計が 20,000円 一括精算と1円単位で完全一致する。差分精算の分配率が正確に適用される |

**source_transaction Transfer フロー（現行アーキテクチャ）:**
```
全ロール（organizer / artist / agent）とも source_transaction: chargeId を指定した Transfer を使用。
platform の available 残高に依存しない。platform 手数料は黙示的回収（gross - 全送金合計）。

transactions.destination_transfer_id は NULL（destination charge は使わない設計に変更済み）
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

### TC-TAX — 手数料計算・端数処理（Stripe/DB 不要）

| ID | タイトル | アサーション |
|----|----------|-------------|
| TC-TAX-01 | カード手数料の基本計算（¥10,000） | stripeFee=396, platformFee=1000, netAmount=8604, appFee=1396 |
| TC-TAX-02 | 端数が出る金額での一貫性（7パターン） | `net + appFee <= gross`、差は最大 1 円、全値が整数 |
| TC-TAX-03 | エージェント手数料 | `floor(gross × 0.05)` = 1000（gross=20000 の場合） |
| TC-TAX-04 | PayPay 手数料 | stripeFee=437（floor(10000 × 0.04378)）、net=8563 |
| TC-TAX-05 | 消費税逆算 | `actual - floor(actual / 1.1)` = 910（actual=10000 の場合） |
| TC-TAX-06 | fee-config フォールバック | DB 接続失敗時にデフォルト値を返す。`getNetRate` / `fmtPct` の動作検証 |

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
- **PayPay テスト（TC-PAY-02）:** Stripe テストモードで PayPay の Checkout Session は作成できるが、実際の決済フローは不完全。Session URL の存在確認のみを行う
