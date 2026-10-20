// DC の MCP サーバー。チアリー(AI) が DC のデータに触るときは、すべてここのツールを通す（Hiro 決定 2026-10-21）。
// 本人（ctx）ごとにサーバーを作り、本人のロールで使えるツールだけを登録する。
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { roleRank } from "@/lib/role-rank";
import type { DcMcpContext } from "./context";
import { MY_TICKETS, myTickets } from "./tools/my-tickets";
import { MY_EVENTS, myEvents } from "./tools/my-events";
import { MY_PAYOUT_BALANCE, myPayoutBalance } from "./tools/my-payout";
import { MY_LINEUPS, myLineups } from "./tools/my-lineups";
import { MY_CHEERS, myCheers } from "./tools/my-cheers";
import { MY_INCOME, myIncome } from "./tools/my-income";

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
  if (allowed(MY_CHEERS.minRole)) {
    server.registerTool(
      MY_CHEERS.name,
      { title: MY_CHEERS.title, description: MY_CHEERS.description, inputSchema: MY_CHEERS.inputSchema, annotations: readOnly },
      async (input) => safe(() => myCheers(ctx, input)),
    );
  }
  if (allowed(MY_LINEUPS.minRole)) {
    server.registerTool(
      MY_LINEUPS.name,
      { title: MY_LINEUPS.title, description: MY_LINEUPS.description, inputSchema: MY_LINEUPS.inputSchema, annotations: readOnly },
      async () => safe(() => myLineups(ctx)),
    );
  }
  if (allowed(MY_PAYOUT_BALANCE.minRole)) {
    server.registerTool(
      MY_PAYOUT_BALANCE.name,
      { title: MY_PAYOUT_BALANCE.title, description: MY_PAYOUT_BALANCE.description, inputSchema: MY_PAYOUT_BALANCE.inputSchema, annotations: readOnly },
      async () => safe(() => myPayoutBalance(ctx)),
    );
  }
  if (allowed(MY_INCOME.minRole)) {
    server.registerTool(
      MY_INCOME.name,
      { title: MY_INCOME.title, description: MY_INCOME.description, inputSchema: MY_INCOME.inputSchema, annotations: readOnly },
      async (input) => safe(() => myIncome(ctx, input)),
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
