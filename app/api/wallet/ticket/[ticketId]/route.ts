import { NextResponse } from "next/server";
import { generateTicketPassBuffer } from "@/lib/apple-pass-generator";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/server";
import { canAccessTicket } from "@/lib/purchase-access";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  const { ticketId } = await params;

  // 入場パス（入場用コード入り）は本人にだけ渡す。ログイン中の持ち主か、
  // その決済の session_id を持つ人（サンクス画面）。チケットIDだけでは発行しない。
  const sessionId = new URL(req.url).searchParams.get("session_id");
  if (!(await canAccessTicket(createAdminClient(), ticketId, { user: await getUser(), sessionId }))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const buffer = await generateTicketPassBuffer(ticketId);
    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.apple.pkpass",
        "Content-Disposition": `attachment; filename="ticket-${ticketId}.pkpass"`,
        "Last-Modified": new Date().toUTCString(),
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    const status = err.status ?? 500;
    console.error("[wallet/ticket]", err.message);
    return NextResponse.json({ error: err.message }, { status });
  }
}
