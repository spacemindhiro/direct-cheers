import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isStepUpFresh } from "@/lib/directory";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ChatBody, FINISH_NOTES, INPUT_MESSAGES, LIMIT_MESSAGES, prepareTurns, reserve, runAndRecord, type CheeryDeps } from "@/lib/ai/chat";
import { modelFor } from "@/lib/ai/config";
import { providerFor } from "@/lib/ai/providers";
import { sendCheeryMonthlyStopEmail } from "@/lib/email/notification";
import { connectDcMcp } from "@/lib/mcp/in-process";
import { REFS_SEPARATOR, extractRefs } from "@/lib/ai/refs";
import { RESET_MARK } from "@/lib/cheery/stream";

export const maxDuration = 60;

const API_KEY_ENV = { anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY" } as const;

// POST /api/cheery/chat
// チアリー(AI) に1回質問する。ログイン必須。会話の履歴は端末にだけあり、毎回ここに送られてくる。
// 返答はテキストを少しずつ流す。会話の中身はどこにも保存せず、ログにも出さない
// （エラー時も種類だけを出す。例外の message には送った内容が含まれうるため出さない）。
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

  const parsed = ChatBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: INPUT_MESSAGES.empty }, { status: 400 });
  const prepared = prepareTurns(parsed.data.turns);
  if (!prepared.ok) return NextResponse.json({ error: INPUT_MESSAGES[prepared.reason] }, { status: 400 });

  // ロールは画面から受け取らず、サーバーで読む
  const { data: profile } = await supabase.from("profiles").select("role, display_name").eq("profile_id", user.id).maybeSingle();
  const role = profile?.role ?? null;

  const spec = modelFor("faq");
  if (!process.env[API_KEY_ENV[spec.provider]]) {
    return NextResponse.json({ error: "チアリー(AI)は準備中です" }, { status: 503 });
  }

  const admin = createAdminClient();
  const deps: CheeryDeps = {
    admin,
    provider: providerFor(spec.provider),
    spec,
    tools: [], // 利用枠を確保したあとに、本人用の MCP をつないで入れる
    notifyMonthlyStop: async ({ month, limitJpy }) => {
      const { data: admins } = await admin.from("profiles").select("profile_id").eq("role", "admin").limit(1);
      const adminId = admins?.[0]?.profile_id;
      if (!adminId) return;
      const { data: adminAuth } = await admin.auth.admin.getUserById(adminId);
      if (adminAuth.user?.email) await sendCheeryMonthlyStopEmail({ to: adminAuth.user.email, month, limitJpy });
    },
  };

  const reserved = await reserve(deps, user.id);
  if (reserved !== "ok") return NextResponse.json({ error: LIMIT_MESSAGES[reserved], reason: reserved }, { status: 429 });

  // DC のデータに触る機能は、すべて本人用の MCP サーバー（lib/mcp）を通す。本人とロールはここで固定する
  // 出演者の照会検索は、ダッシュボードのパスキー確認（24時間）が済んでいるときだけ（directory/search と同じ判定）
  const stepUpFresh = isStepUpFresh((await cookies()).get("dc_stepup")?.value);
  const mcp = await connectDcMcp({ userId: user.id, email: user.email ?? null, role: role ?? "user", supabase, admin, stepUpFresh, mode: "chat" });
  deps.tools = mcp.tools;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        let answer = "";
        const result = await runAndRecord(deps, {
          profileId: user.id,
          role,
          displayName: profile?.display_name ?? null,
          turns: prepared.turns,
          screen: parsed.data.screen,
          // 本文に区切り記号・消す印が混ざると、画面がカードの材料として読んだり本文を消したりしてしまう（データに仕込まれた偽のカード）。必ず取り除く
          onText: (d) => { const t = d.split(REFS_SEPARATOR).join("").split(RESET_MARK).join(""); answer += t; controller.enqueue(encoder.encode(t)); },
          // ツールを呼ぶ前の前置きは画面から消し、参照（〔参照:…〕）も最後の答えから取る
          onToolRound: () => { answer = ""; controller.enqueue(encoder.encode(RESET_MARK)); },
          signal: req.signal,
        });
        const note = FINISH_NOTES[result.finish];
        if (note) controller.enqueue(encoder.encode(`\n\n${note}`));
        // 答えの根拠に挙がった項目から、行き先ボタン・動画カードの材料を作って最後に付ける（本人のロールで見てよい項目だけ）。
        // 確認カードは、ツールの結果（_meta）からだけ作る（AI の書いた文字からは作らない）
        controller.enqueue(encoder.encode(`${REFS_SEPARATOR}${JSON.stringify({ refs: extractRefs(answer, role), cards: mcp.cards() })}`));
      } catch (err) {
        console.error("[cheery/chat] 応答に失敗:", (err as { constructor?: { name?: string } })?.constructor?.name ?? "unknown",
          (err as { status?: number })?.status ?? "");
        controller.enqueue(encoder.encode("\n\n（うまく答えられませんでした。少し時間をおいてもう一度お試しください）"));
      } finally {
        await mcp.close().catch(() => {});
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
