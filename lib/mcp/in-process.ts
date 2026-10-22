// DC のサーバーの中で、MCP のクライアントとサーバーを直接つなぐ（外から呼べる口は開けない。最初は内部だけ：Hiro 2026-10-21）。
// クライアント側で tools/list・tools/call を使い、チアリー(AI) に渡すツールの形にする。
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { AiTool } from "@/lib/ai/types";
import type { DcMcpContext } from "./context";
import { createDcMcpServer } from "./server";
import { CARDS_META_KEY, type CheeryCard } from "@/lib/cheery/cards";

export type DcMcpSession = {
  tools: AiTool[];
  // この会話の中でツールが出した確認カード（AI には渡さず、応答の最後に画面へ渡す）
  cards: () => CheeryCard[];
  // ツールを直接呼ぶ（/api/cheery/action が、本人がカードのボタンを押したときに使う。AI は通らない）
  call: (name: string, args: Record<string, unknown>) => Promise<{ text: string; isError: boolean }>;
  close: () => Promise<void>;
};

export async function connectDcMcp(ctx: DcMcpContext): Promise<DcMcpSession> {
  const server = createDcMcpServer(ctx);
  const client = new Client({ name: "cheery", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const cards: CheeryCard[] = [];
  const { tools: listed } = await client.listTools();
  const tools: AiTool[] = listed.map((t) => ({
    name: t.name,
    description: t.description ?? "",
    inputSchema: t.inputSchema as Record<string, unknown>,
    run: async (input) => {
      const r = await client.callTool({ name: t.name, arguments: input });
      // カードの材料（内部 ID を含む）は取り分けて、AI には本文だけを渡す
      const metaCards = (r._meta as Record<string, unknown> | undefined)?.[CARDS_META_KEY];
      if (Array.isArray(metaCards)) cards.push(...(metaCards as CheeryCard[]));
      const text = ((r.content ?? []) as { type: string; text?: string }[])
        .filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("\n");
      // 入力の検査に落ちたときの詳細（モデルの入力を含む）はそのまま返さない
      if (r.isError) return { content: text.startsWith("データの取得に失敗しました") ? text : "入力の形式が正しくありません", isError: true };
      return { content: text, isError: false };
    },
  }));

  return {
    tools,
    cards: () => [...cards],
    call: async (name, args) => {
      const r = await client.callTool({ name, arguments: args });
      const text = ((r.content ?? []) as { type: string; text?: string }[]).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
      return { text, isError: r.isError === true };
    },
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}
