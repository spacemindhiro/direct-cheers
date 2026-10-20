// チアリー(AI) の設定：用途ごとのモデル・単価・利用上限。
// モデルは環境変数で切り替える（CHEERY_MODEL_FAQ / CHEERY_MODEL_DRAFT に "provider:model" を書く）。
// 単価を登録していないモデルは使えない（月の上限を金額で守るため、単価が分からないモデルでは上限が効かない）。

export type AiProvider = "anthropic" | "openai";
export type AiPurpose = "faq" | "draft";

export type ModelSpec = {
  key: string;            // "anthropic:claude-haiku-5-5"
  provider: AiProvider;
  model: string;
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
  cacheReadMultiplier: number;  // キャッシュから読んだ入力の単価倍率
  cacheWriteMultiplier: number; // キャッシュに書いた入力の単価倍率
};

// 単価は公式の料金で確認できたものだけを登録する（確認日と出典を添える）
export const MODELS: Record<string, ModelSpec> = {
  // 2026-10-20 確認：入力 $0.10 / 出力 $0.50（100万トークンあたり、プロンプト10万トークン以下）。
  // キャッシュ読み込み 0.1倍・書き込み（5分）1.25倍。チアリーのプロンプトは10万トークンを大きく下回る
  "anthropic:claude-haiku-5-5": {
    key: "anthropic:claude-haiku-5-5",
    provider: "anthropic",
    model: "claude-haiku-5-5",
    inputUsdPerMTok: 0.1,
    outputUsdPerMTok: 0.5,
    cacheReadMultiplier: 0.1,
    cacheWriteMultiplier: 1.25,
  },
  // 2026-10-21 公式の料金ページで確認（https://developers.openai.com/api/docs/pricing）：
  // 入力 $0.10 / キャッシュ読み $0.01 / キャッシュ書き込み $0.125 / 出力 $0.50（100万トークンあたり、入力27.2万トークン以下）
  "openai:gpt-6-luna": {
    key: "openai:gpt-6-luna",
    provider: "openai",
    model: "gpt-6-luna",
    inputUsdPerMTok: 0.1,
    outputUsdPerMTok: 0.5,
    cacheReadMultiplier: 0.1,
    cacheWriteMultiplier: 1.25,
  },
};

// 既定は OpenAI（Hiro 2026-10-21：チャージ済みの OpenAI で動作確認・答え合わせを始める）
export const DEFAULT_MODEL: Record<AiPurpose, string> = {
  faq: "openai:gpt-6-luna",
  draft: "openai:gpt-6-luna",
};

const ENV_KEY: Record<AiPurpose, string> = { faq: "CHEERY_MODEL_FAQ", draft: "CHEERY_MODEL_DRAFT" };

export function modelFor(purpose: AiPurpose, env: Record<string, string | undefined> = process.env): ModelSpec {
  const key = env[ENV_KEY[purpose]] || DEFAULT_MODEL[purpose];
  const spec = MODELS[key];
  if (!spec) throw new Error(`チアリーのモデル設定が不正です（単価未登録）: ${ENV_KEY[purpose]}=${key}`);
  return spec;
}

// 利用上限（requirements.md 8章）
export const DAILY_REQUEST_LIMIT = 200;   // 1人1日あたりの回数
export const USD_JPY = 150;               // 月額上限の円換算に使うレート
export const MONTHLY_LIMIT_JPY = 3000;    // DC全体の月額。超えたらその月は止めて運営にメール
export const MONTHLY_LIMIT_USD = MONTHLY_LIMIT_JPY / USD_JPY;
export const INPUT_MAX_CHARS = 2000;      // 1回の入力
// 端末から送られてくる会話の履歴（費用を抑えるため直近だけ使う）
export const HISTORY_MAX_TURNS = 20;
export const HISTORY_MAX_CHARS = 12000;
export const MAX_OUTPUT_TOKENS = 1500;
export const MAX_TOOL_ROUNDS = 4;         // 1回の質問でデータ取得を繰り返す上限

export function costUsd(
  spec: ModelSpec,
  u: { inputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; outputTokens: number },
): number {
  const input =
    u.inputTokens * spec.inputUsdPerMTok +
    u.cacheReadTokens * spec.inputUsdPerMTok * spec.cacheReadMultiplier +
    u.cacheWriteTokens * spec.inputUsdPerMTok * spec.cacheWriteMultiplier;
  return (input + u.outputTokens * spec.outputUsdPerMTok) / 1_000_000;
}
