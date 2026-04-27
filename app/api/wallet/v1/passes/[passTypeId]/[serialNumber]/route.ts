import { NextResponse } from "next/server";
import { generatePassBuffer } from "@/lib/apple-pass-generator";

type Params = { passTypeId: string; serialNumber: string };

// Wallet が最新パスを取得（push通知後に呼ばれる）
export async function GET(
  req: Request,
  { params }: { params: Promise<Params> }
) {
  const secret = process.env.WALLET_AUTH_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `ApplePass ${secret}`) {
    return new NextResponse(null, { status: 401 });
  }

  const { serialNumber } = await params;

  try {
    const buffer = await generatePassBuffer(serialNumber);
    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.apple.pkpass",
        "Last-Modified": new Date().toUTCString(),
      },
    });
  } catch (err: any) {
    const status = err.status ?? 500;
    console.error("[wallet/v1/passes]", err.message);
    return new NextResponse(null, { status });
  }
}
