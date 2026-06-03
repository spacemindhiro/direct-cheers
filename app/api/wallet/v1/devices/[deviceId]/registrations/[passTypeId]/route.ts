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

  // passesUpdatedSince: iOS が前回確認した時刻（Unix秒）。
  // この時刻以降に pass_updated_at が更新されたパスのみ返す。
  // 未指定の場合は全件返す（初回登録時など）。
  const url = new URL(req.url);
  const passesUpdatedSince = url.searchParams.get("passesUpdatedSince");

  let query = admin
    .from("wallet_device_registrations")
    .select("serial_number, pass_updated_at")
    .eq("device_library_identifier", deviceId)
    .eq("pass_type_identifier", passTypeId);

  if (passesUpdatedSince) {
    // passesUpdatedSince は Unix秒 → ISO文字列に変換してフィルタ
    const sinceDate = new Date(parseInt(passesUpdatedSince, 10) * 1000).toISOString();
    query = query.gt("pass_updated_at", sinceDate);
  }

  const { data: rows } = await query;

  if (!rows || rows.length === 0) {
    return new NextResponse(null, { status: 204 });
  }

  // lastUpdated: 返すパスの中で最も新しい pass_updated_at を Unix秒で返す
  const maxUpdated = rows.reduce((max, r) => {
    const t = r.pass_updated_at ? new Date(r.pass_updated_at).getTime() : 0;
    return t > max ? t : max;
  }, 0);

  return NextResponse.json({
    serialNumbers: rows.map((r) => r.serial_number),
    lastUpdated: String(Math.floor(maxUpdated / 1000)),
  });
}
