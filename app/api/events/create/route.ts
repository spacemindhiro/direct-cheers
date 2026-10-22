import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createEventDraft, type CreateDraftInput } from "@/lib/events/create-draft";

// 中身（ロール・担当エージェント・代理の範囲・出演者の資格・代理の下書きを隠す処理）は lib/events/create-draft.ts。
// チアリー(AI) の MCP の書き込みツールも同じ関数を通す
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as CreateDraftInput;
  const result = await createEventDraft(supabase, createAdminClient(), user.id, body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ event_id: result.eventId });
}
