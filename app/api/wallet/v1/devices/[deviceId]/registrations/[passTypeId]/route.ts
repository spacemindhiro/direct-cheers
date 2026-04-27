import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Params = { deviceId: string; passTypeId: string };

// Wallet が「このデバイスに紐づく更新済みパス一覧」を取得
export async function GET(
  req: Request,
  { params }: { params: Promise<Params> }
) {
  const secret = process.env.WALLET_AUTH_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `ApplePass ${secret}`) {
    return new NextResponse(null, { status: 401 });
  }

  const { deviceId, passTypeId } = await params;
  const admin = createAdminClient();

  const { data: rows } = await admin
    .from("wallet_device_registrations")
    .select("serial_number")
    .eq("device_library_identifier", deviceId)
    .eq("pass_type_identifier", passTypeId);

  if (!rows || rows.length === 0) {
    return new NextResponse(null, { status: 204 });
  }

  return NextResponse.json({
    serialNumbers: rows.map((r) => r.serial_number),
    lastUpdated: String(Date.now()),
  });
}
