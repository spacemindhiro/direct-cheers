// DC の MCP サーバー。チアリー(AI) が DC のデータに触るときは、すべてここのツールを通す（Hiro 決定 2026-10-21）。
// 本人（ctx）ごとにサーバーを作り、本人のロールで使えるツールだけを登録する。
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { roleRank } from "@/lib/role-rank";
import type { DcMcpContext } from "./context";
import { MY_TICKETS, myTickets } from "./tools/my-tickets";
import { MY_EVENTS, myEvents } from "./tools/my-events";

export const DC_MCP_SERVER_INFO = { name: "direct-cheers", version: "0.1.0" };

// ツールの中で例外が起きたときは、中身（データが含まれうる）を返さずに決まった文だけ返す
async function safe(run: () => Promise<string>) {
  try {
    return { content: [{ type: "text" as const, text: await run() }] };
  } catch {
    return { content: [{ type: "text" as const, text: "データの取得に失敗しました" }], isError: true };
  }
}

export function createDcMcpServer(ctx: DcMcpContext): McpServer {
  const server = new McpServer(DC_MCP_SERVER_INFO);
  const allowed = (minRole: string) => roleRank(ctx.role) >= roleRank(minRole);
  const readOnly = { readOnlyHint: true, openWorldHint: false };

  if (allowed(MY_TICKETS.minRole)) {
    server.registerTool(
      MY_TICKETS.name,
      { title: MY_TICKETS.title, description: MY_TICKETS.description, inputSchema: MY_TICKETS.inputSchema, annotations: readOnly },
      async (input) => safe(() => myTickets(ctx, input)),
    );
  }
  if (allowed(MY_EVENTS.minRole)) {
    server.registerTool(
      MY_EVENTS.name,
      { title: MY_EVENTS.title, description: MY_EVENTS.description, inputSchema: MY_EVENTS.inputSchema, annotations: readOnly },
      async (input) => safe(() => myEvents(ctx, input)),
    );
  }
  return server;
}
