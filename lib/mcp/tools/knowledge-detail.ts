// knowledge_detail：DC知識集の「詳細」の本文を読む。システムプロンプトには要点と詳細の目次だけを入れ、
// 細かい手順・例外・規約の要点などは AI が必要なときにここで読む（毎回渡す量を抑えて精度を保つため）。
// ロールに見せてよい項目だけ返す（上位ロール向けの項目は ID を言い当てても読めない）。
import { z } from "zod";
import { knowledgeDetailForRole } from "@/lib/knowledge/assemble";
import type { DcMcpContext } from "../context";

export const KNOWLEDGE_DETAIL = {
  name: "knowledge_detail",
  minRole: "user",
  title: "DC知識集の詳細",
  description: "DC知識集の「詳細の目次」にある項目の本文を読む。答える前に、関係しそうな項目の ID を1〜3個指定して読むこと。",
  inputSchema: { ids: z.array(z.string().max(80)).min(1).max(3).describe("詳細の目次にある ID（1〜3個）") },
} as const;

export async function knowledgeDetail(ctx: DcMcpContext, input: { ids: string[] }): Promise<string> {
  return knowledgeDetailForRole(ctx.role, input.ids);
}
