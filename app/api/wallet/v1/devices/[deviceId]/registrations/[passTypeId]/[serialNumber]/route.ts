import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Params = { deviceId: string; passTypeId: string; serialNumber: string };

function validateAuth(req: Request): boolean {
  const secret = process.env.WALLET_AUTH_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `ApplePass ${secret}`;
}

// デバイスがパスへの更新通知を登録
export async function POST(
  req: Request,
  { params }: { params: Promise<Params> }
) {
  if (!validateAuth(req)) return new NextResponse(null, { status: 401 });

  const { deviceId, passTypeId, serialNumber } = await params;
  const body = await req.json().catch(() => ({}));
  const pushToken = body.pushToken as string | undefined;
  if (!pushToken) return new NextResponse(null, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("wallet_device_registrations").upsert(
    {
      device_library_identifier: deviceId,
      push_token: pushToken,
      serial_number: serialNumber,
      pass_type_identifier: passTypeId,
    },
    { onConflict: "device_library_identifier,serial_number" }
  );

  if (error) {
    console.error("[wallet/v1/register]", error.message);
    return new NextResponse(null, { status: 500 });
  }

  return new NextResponse(null, { status: 201 });
}

// デバイスがパスへの更新通知を解除
export async function DELETE(
  req: Request,
  { params }: { params: Promise<Params> }
) {
  if (!validateAuth(req)) return new NextResponse(null, { status: 401 });

  const { deviceId, serialNumber } = await params;
  const admin = createAdminClient();
  await admin
    .from("wallet_device_registrations")
    .delete()
    .eq("device_library_identifier", deviceId)
    .eq("serial_number", serialNumber);

  return new NextResponse(null, { status: 200 });
}
