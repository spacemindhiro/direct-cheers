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
import { MY_ACCOUNT, myAccount } from "./tools/my-account";
import { MY_INCOME, myIncome } from "./tools/my-income";
import { MY_PAYOUT_HISTORY, myPayoutHistory } from "./tools/my-payout-history";
import { KNOWLEDGE_DETAIL, knowledgeDetail } from "./tools/knowledge-detail";
import { MY_STATS, STATS_HIDDEN_ROLES, myStats } from "./tools/my-stats";
import { MY_QR_TARGETS, myQrTargets } from "./tools/my-qr-targets";
import { MY_INVITATIONS, myInvitations } from "./tools/my-invitations";
import { detailIndexForRole } from "@/lib/knowledge/assemble";

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

  // 詳細の項目が1つも無いロールには渡さない（存在しない ID で無駄に呼ばれるため）
  if (allowed(KNOWLEDGE_DETAIL.minRole) && detailIndexForRole(ctx.role) !== "") {
    server.registerTool(
      KNOWLEDGE_DETAIL.name,
      { title: KNOWLEDGE_DETAIL.title, description: KNOWLEDGE_DETAIL.description, inputSchema: KNOWLEDGE_DETAIL.inputSchema, annotations: readOnly },
      async (input) => safe(() => knowledgeDetail(ctx, input)),
    );
  }
  if (allowed(MY_TICKETS.minRole)) {
    server.registerTool(
      MY_TICKETS.name,
      { title: MY_TICKETS.title, description: MY_TICKETS.description, inputSchema: MY_TICKETS.inputSchema, annotations: readOnly },
      async (input) => safe(() => myTickets(ctx, input)),
    );
  }
  if (allowed(MY_ACCOUNT.minRole)) {
    server.registerTool(
      MY_ACCOUNT.name,
      { title: MY_ACCOUNT.title, description: MY_ACCOUNT.description, inputSchema: MY_ACCOUNT.inputSchema, annotations: readOnly },
      async () => safe(() => myAccount(ctx)),
    );
  }
  if (allowed(MY_CHEERS.minRole)) {
    server.registerTool(
      MY_CHEERS.name,
      { title: MY_CHEERS.title, description: MY_CHEERS.description, inputSchema: MY_CHEERS.inputSchema, annotations: readOnly },
      async (input) => safe(() => myCheers(ctx, input)),
    );
  }
  if (allowed(MY_STATS.minRole) && !STATS_HIDDEN_ROLES.includes(ctx.role)) {
    server.registerTool(
      MY_STATS.name,
      { title: MY_STATS.title, description: MY_STATS.description, inputSchema: MY_STATS.inputSchema, annotations: readOnly },
      async () => safe(() => myStats(ctx)),
    );
  }
  if (allowed(MY_LINEUPS.minRole)) {
    server.registerTool(
      MY_LINEUPS.name,
      { title: MY_LINEUPS.title, description: MY_LINEUPS.description, inputSchema: MY_LINEUPS.inputSchema, annotations: readOnly },
      async () => safe(() => myLineups(ctx)),
    );
  }
  if (allowed(MY_QR_TARGETS.minRole)) {
    server.registerTool(
      MY_QR_TARGETS.name,
      { title: MY_QR_TARGETS.title, description: MY_QR_TARGETS.description, inputSchema: MY_QR_TARGETS.inputSchema, annotations: readOnly },
      async (input) => safe(() => myQrTargets(ctx, input)),
    );
  }
  if (allowed(MY_PAYOUT_BALANCE.minRole)) {
    server.registerTool(
      MY_PAYOUT_BALANCE.name,
      { title: MY_PAYOUT_BALANCE.title, description: MY_PAYOUT_BALANCE.description, inputSchema: MY_PAYOUT_BALANCE.inputSchema, annotations: readOnly },
      async () => safe(() => myPayoutBalance(ctx)),
    );
  }
  if (allowed(MY_PAYOUT_HISTORY.minRole)) {
    server.registerTool(
      MY_PAYOUT_HISTORY.name,
      { title: MY_PAYOUT_HISTORY.title, description: MY_PAYOUT_HISTORY.description, inputSchema: MY_PAYOUT_HISTORY.inputSchema, annotations: readOnly },
      async () => safe(() => myPayoutHistory(ctx)),
    );
  }
  if (allowed(MY_INCOME.minRole)) {
    server.registerTool(
      MY_INCOME.name,
      { title: MY_INCOME.title, description: MY_INCOME.description, inputSchema: MY_INCOME.inputSchema, annotations: readOnly },
      async (input) => safe(() => myIncome(ctx, input)),
    );
  }
  if (allowed(MY_INVITATIONS.minRole)) {
    server.registerTool(
      MY_INVITATIONS.name,
      { title: MY_INVITATIONS.title, description: MY_INVITATIONS.description, inputSchema: MY_INVITATIONS.inputSchema, annotations: readOnly },
      async (input) => safe(() => myInvitations(ctx, input)),
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
