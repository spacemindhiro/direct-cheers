import { NextResponse } from "next/server";
import { generateTicketPassBuffer } from "@/lib/apple-pass-generator";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  const { ticketId } = await params;

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
