import { NextResponse } from "next/server";
import { generatePassBuffer } from "@/lib/apple-pass-generator";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ transactionId: string }> }
) {
  const { transactionId } = await params;

  try {
    const buffer = await generatePassBuffer(transactionId);
    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.apple.pkpass",
        "Content-Disposition": `attachment; filename="cheers-${transactionId}.pkpass"`,
        "Last-Modified": new Date().toUTCString(),
      },
    });
  } catch (err: any) {
    const status = err.status ?? 500;
    console.error("[wallet/pass]", err.message);
    return NextResponse.json({ error: err.message }, { status });
  }
}
