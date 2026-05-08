/**
 * POST /api/internal/wallet-push
 * Edge Function から呼ばれる内部エンドポイント。
 * INTERNAL_SECRET ヘッダーで認証する。
 */
import { NextResponse } from "next/server";
import { pushWalletUpdateBySerial } from "@/lib/apple-wallet-push";

export async function POST(req: Request) {
  const secret = req.headers.get("x-internal-secret");
  if (!secret || secret !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { ticket_id } = await req.json() as { ticket_id: string };
  if (!ticket_id) {
    return NextResponse.json({ error: "Missing ticket_id" }, { status: 400 });
  }

  await pushWalletUpdateBySerial(ticket_id).catch(() => {});
  return NextResponse.json({ ok: true });
}
