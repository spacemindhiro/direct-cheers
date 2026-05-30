# Direct Cheers — 統合テスト仕様書

> **最終更新:** 2026-05-30  
> **対象ブランチ:** develop  
> **テストランナー:** Vitest 4.x

---

## 1. テスト環境の座組み

| レイヤー | 方針 |
|----------|------|
| テストランナー | Vitest 4（ESM ネイティブ、Next.js / Stripe SDK v20 と互換） |
| Stripe | **モックしない**。`STRIPE_SECRET_KEY=sk_test_*` でテストモード API を実際に呼ぶ |
| Supabase | **モックしない**。`supabase start` で起動したローカル Docker DB を使う |
| Next.js server utils | `@/lib/supabase/server`（`createClient`, `getUser`）のみ `vi.mock` でダミー返却 |
| `next/headers` | `vi.mock` でダミー返却（テスト環境に Request context がないため） |

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
    ├── pay-cheers.test.ts  TC-PAY   /api/pay/cheers
    ├── settle.test.ts      TC-SETTLE /api/events/[eventId]/settle
    ├── payout.test.ts      TC-PAYOUT /api/payout/request
    ├── chargeback.test.ts  TC-CB    /api/stripe/webhook（dispute イベント）
    └── tax.test.ts         TC-TAX   手数料計算・端数処理（純ロジック）
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

**手数料計算（TC-PAY-01）:**
```
application_fee_amount = floor(gross × platform_rate) + floor(gross × stripe_rate)
                       = floor(10000 × 0.10) + floor(10000 × 0.0396)
                       = 1000 + 396 = 1396
organizer 受取 = gross - application_fee_amount = 10000 - 1396 = 8604
```

---

### TC-SETTLE — /api/events/[eventId]/settle（決済キャプチャ・送金）

| ID | タイトル | アサーション |
|----|----------|-------------|
| TC-SETTLE-01 | destination charge 新フロー | `transactions.destination_transfer_id` に `tr_*` が記録される。artist に sub-transfer が作成される。organizer の `settle_transfers` 行は作成されない |
| TC-SETTLE-03 | エージェント手数料 | `transaction_distributions` に agent 行（`actual_amount = floor(gross × 0.05)`）が作成される。`settle_transfers` にも agent 分の transfer が存在する |
| TC-SETTLE-04 | 未確定アーティスト → オーガナイザー帰属 | `event_artists.status = "pending"` のアーティストへの配分が organizer に振り替えられる |
| TC-SETTLE-05 | 二重 settle 防止 | HTTP 400 `Already settled` |

**新フロー判定:**
```
transactions.destination_transfer_id IS NOT NULL → 新フロー
  organizer: 自動送金済みのため settle_transfers は作成しない
  artist:    organizer の Connect アカウントから sub-transfer（stripeAccount オプション）
  agent:     platform から直接 Transfer（変わらず）
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
