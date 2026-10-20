import type { AiProvider } from "../config";
import type { ChatProvider } from "../types";
import { createAnthropicProvider } from "./anthropic";
import { createOpenAIProvider } from "./openai";

// APIキーは環境変数（ANTHROPIC_API_KEY / OPENAI_API_KEY）から SDK が読む。コードやログには出さない
export function providerFor(provider: AiProvider): ChatProvider {
  return provider === "anthropic" ? createAnthropicProvider() : createOpenAIProvider();
}
