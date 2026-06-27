import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushWalletUpdateBySerial } from "@/lib/apple-wallet-push";

export async function POST(req: Request) {
  const { transaction_id, nickname, comment } = await req.json() as {
    transaction_id: string;
    nickname?: string;
    comment?: string;
  };

  if (!transaction_id) {
    return NextResponse.json({ error: "Missing transaction_id" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { error } = await admin
    .from("transactions")
    .update({
      sender_name: nickname || null,
      sender_comment: comment || null,
    })
    .eq("transaction_id", transaction_id)
    .is("sender_name", null)
    .is("sender_comment", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // ウォレット登録済みデバイスに push（fire-and-forget）
  pushWalletUpdateBySerial(transaction_id).catch((err) =>
    console.error("[pay/message] wallet push failed:", err)
  );

  return NextResponse.json({ ok: true });
}
