import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { reconcileTicketForUser } from "@/lib/touchpay-reconcile";

// POST /api/entrance/touchpay-signup/[ticketId]/reconcile
// ログイン済みユーザーが、タッチ決済のサインアップQRから直接（既にログイン済みの状態で）
// 訪れた場合に、その場で名寄せを行う。
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  const { ticketId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { reconciled } = await reconcileTicketForUser(ticketId, user.id, user.email ?? null);
  return NextResponse.json({ ok: true, reconciled });
}
