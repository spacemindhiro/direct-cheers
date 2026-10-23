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
import { EVENT_DETAIL, eventDetail } from "./tools/event-detail";
import { EVIDENCE_STATUS, evidenceStatus } from "./tools/evidence-status";
import { SETTLEMENT_REPORT, settlementReport } from "./tools/settlement-report";
import { AGENT_ORGANIZERS, agentOrganizers } from "./tools/agent-organizers";
import { AGENT_HANDOFFS, agentHandoffs } from "./tools/agent-handoffs";
import { AGENT_PROXY_DRAFTS, agentProxyDrafts } from "./tools/agent-proxy-drafts";
import { MY_CONVERSATIONS, READ_CONVERSATION, listConversations, readConversation } from "./tools/messages";
import { ADMIN_OVERVIEW, adminOverview } from "./tools/admin-overview";
import { FIND_VENUE, CHECK_VENUE_ADDRESS, VENUE_PIN, REGISTER_VENUE, findVenue, checkVenueAddress, venuePin, registerVenueTool } from "./tools/venue-tools";
import { PREPARE_EVENT_DRAFT, CREATE_EVENT_DRAFT, prepareEventDraft, createEventDraftTool } from "./tools/event-draft";
import { PREPARE_QR, CREATE_QR, prepareQr, createQrTool } from "./tools/qr-create";
import { CARDS_META_KEY, type CheeryCard } from "@/lib/cheery/cards";
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

// 確認カードを出すツール。AI には text だけが渡り、カードの材料（内部 ID を含む）は _meta で画面にだけ渡る（lib/mcp/in-process.ts）
async function safeWithCards(run: () => Promise<{ text: string; cards?: CheeryCard[] }>) {
  try {
    const { text, cards } = await run();
    return { content: [{ type: "text" as const, text }], _meta: { [CARDS_META_KEY]: cards ?? [] } };
  } catch {
    return { content: [{ type: "text" as const, text: "データの取得に失敗しました" }], isError: true };
  }
}

// 書き込みのツールの結果は、画面に返す JSON（AI には渡らない）
async function safeWrite(run: () => Promise<unknown>) {
  try {
    return { content: [{ type: "text" as const, text: JSON.stringify(await run()) }] };
  } catch {
    return { content: [{ type: "text" as const, text: JSON.stringify({ ok: false, error: "処理に失敗しました" }) }], isError: true };
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
  if (allowed(EVENT_DETAIL.minRole)) {
    server.registerTool(
      EVENT_DETAIL.name,
      { title: EVENT_DETAIL.title, description: EVENT_DETAIL.description, inputSchema: EVENT_DETAIL.inputSchema, annotations: readOnly },
      async (input) => safe(() => eventDetail(ctx, input)),
    );
  }
  if (allowed(EVIDENCE_STATUS.minRole)) {
    server.registerTool(
      EVIDENCE_STATUS.name,
      { title: EVIDENCE_STATUS.title, description: EVIDENCE_STATUS.description, inputSchema: EVIDENCE_STATUS.inputSchema, annotations: readOnly },
      async (input) => safe(() => evidenceStatus(ctx, input)),
    );
  }
  if (allowed(SETTLEMENT_REPORT.minRole)) {
    server.registerTool(
      SETTLEMENT_REPORT.name,
      { title: SETTLEMENT_REPORT.title, description: SETTLEMENT_REPORT.description, inputSchema: SETTLEMENT_REPORT.inputSchema, annotations: readOnly },
      async (input) => safe(() => settlementReport(ctx, input)),
    );
  }
  if (allowed(AGENT_ORGANIZERS.minRole)) {
    server.registerTool(
      AGENT_ORGANIZERS.name,
      { title: AGENT_ORGANIZERS.title, description: AGENT_ORGANIZERS.description, inputSchema: AGENT_ORGANIZERS.inputSchema, annotations: readOnly },
      async (input) => safe(() => agentOrganizers(ctx, input)),
    );
  }
  if (allowed(AGENT_HANDOFFS.minRole)) {
    server.registerTool(
      AGENT_HANDOFFS.name,
      { title: AGENT_HANDOFFS.title, description: AGENT_HANDOFFS.description, inputSchema: AGENT_HANDOFFS.inputSchema, annotations: readOnly },
      async (input) => safe(() => agentHandoffs(ctx, input)),
    );
  }
  if (allowed(AGENT_PROXY_DRAFTS.minRole)) {
    server.registerTool(
      AGENT_PROXY_DRAFTS.name,
      { title: AGENT_PROXY_DRAFTS.title, description: AGENT_PROXY_DRAFTS.description, inputSchema: AGENT_PROXY_DRAFTS.inputSchema, annotations: readOnly },
      async (input) => safe(() => agentProxyDrafts(ctx, input)),
    );
  }
  if (allowed(MY_CONVERSATIONS.minRole)) {
    server.registerTool(
      MY_CONVERSATIONS.name,
      { title: MY_CONVERSATIONS.title, description: MY_CONVERSATIONS.description, inputSchema: MY_CONVERSATIONS.inputSchema, annotations: readOnly },
      async (input) => safe(() => listConversations(ctx, input)),
    );
  }
  if (allowed(READ_CONVERSATION.minRole)) {
    server.registerTool(
      READ_CONVERSATION.name,
      { title: READ_CONVERSATION.title, description: READ_CONVERSATION.description, inputSchema: READ_CONVERSATION.inputSchema, annotations: readOnly },
      async (input) => safe(() => readConversation(ctx, input)),
    );
  }
  // イベント作成（P5）。読み取り：会場を探す・住所を確かめる・ピンのカード・下書きの確認カード・QR の確認カード
  const lookup = { readOnlyHint: true, openWorldHint: true }; // Google の地図サービスを呼ぶものがある
  for (const [def, run] of [
    [FIND_VENUE, (i: never) => findVenue(ctx, i)],
    [CHECK_VENUE_ADDRESS, (i: never) => checkVenueAddress(ctx, i)],
    [VENUE_PIN, (i: never) => venuePin(ctx, i)],
    [PREPARE_EVENT_DRAFT, (i: never) => prepareEventDraft(ctx, i)],
    [PREPARE_QR, (i: never) => prepareQr(ctx, i)],
  ] as const) {
    if (!allowed(def.minRole)) continue;
    server.registerTool(
      def.name,
      { title: def.title, description: def.description, inputSchema: def.inputSchema, annotations: lookup },
      async (input: unknown) => safeWithCards(() => (run as (i: unknown) => Promise<{ text: string; cards?: CheeryCard[] }>)(input)),
    );
  }
  // 書き込みは、本人が確認カードのボタンを押したときだけ（AI との会話では tools/list にも出さない）
  if (ctx.mode === "action") {
    const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
    if (allowed(REGISTER_VENUE.minRole)) {
      server.registerTool(
        REGISTER_VENUE.name,
        { title: REGISTER_VENUE.title, description: REGISTER_VENUE.description, inputSchema: REGISTER_VENUE.inputSchema, annotations: write },
        async (input) => safeWrite(() => registerVenueTool(ctx, input)),
      );
    }
    if (allowed(CREATE_EVENT_DRAFT.minRole)) {
      server.registerTool(
        CREATE_EVENT_DRAFT.name,
        { title: CREATE_EVENT_DRAFT.title, description: CREATE_EVENT_DRAFT.description, inputSchema: CREATE_EVENT_DRAFT.inputSchema, annotations: write },
        async (input) => safeWrite(() => createEventDraftTool(ctx, input)),
      );
    }
    if (allowed(CREATE_QR.minRole)) {
      server.registerTool(
        CREATE_QR.name,
        { title: CREATE_QR.title, description: CREATE_QR.description, inputSchema: CREATE_QR.inputSchema, annotations: write },
        async (input) => safeWrite(() => createQrTool(ctx, input)),
      );
    }
  }
  // 運営向けは admin のセッションにだけ（上位互換の判定ではなく、ロールそのもので絞る）
  if (ctx.role === "admin") {
    server.registerTool(
      ADMIN_OVERVIEW.name,
      { title: ADMIN_OVERVIEW.title, description: ADMIN_OVERVIEW.description, inputSchema: ADMIN_OVERVIEW.inputSchema, annotations: readOnly },
      async (input) => safe(() => adminOverview(ctx, input)),
    );
  }
  return server;
}
