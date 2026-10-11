import { NextResponse } from "next/server";
import { generatePassBuffer } from "@/lib/apple-pass-generator";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/server";
import { canAccessTransaction } from "@/lib/purchase-access";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ transactionId: string }> }
) {
  const { transactionId } = await params;

  // Cheersカード（送り主名・メッセージ・金額入り）は本人にだけ渡す。ログイン中の送り主か、
  // その決済の session_id を持つ人（サンクス画面）。取引IDだけでは発行しない。
  const sessionId = new URL(req.url).searchParams.get("session_id");
  if (!(await canAccessTransaction(createAdminClient(), transactionId, { user: await getUser(), sessionId }))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

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
