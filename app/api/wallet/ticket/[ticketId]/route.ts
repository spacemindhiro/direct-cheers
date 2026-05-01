import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateTicketPassBuffer } from "@/lib/apple-pass-generator";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  const { ticketId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: ticket } = await admin
    .from("tickets")
    .select("holder_profile_id")
    .eq("ticket_id", ticketId)
    .single();

  if (!ticket || ticket.holder_profile_id !== user.id) {
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
      },
    });
  } catch (err: any) {
    const status = err.status ?? 500;
    console.error("[wallet/ticket]", err.message);
    return NextResponse.json({ error: err.message }, { status });
  }
}
