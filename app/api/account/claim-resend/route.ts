import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CLAIM_RESEND_INTERVAL_SEC,
  claimRedirectPathFor,
  issuePurchaseClaimUrl,
  sendClaimLinkEmail,
} from "@/lib/purchase-claim";

// POST /api/account/claim-resend
//
// サンクス画面の「確認メールを再送」。レシートメールに載せた決済後アカウント作成
// リンク（/auth/claim/<token>）を、新しいトークンでもう一度そのメールへ送る。
// 未ログインで叩かれる前提なので、宛先はクライアント入力ではなく決済行の
// sender_email から取り、かつ渡された email と一致する場合のみ送る
// （transaction_id は推測不能な uuid だが、それだけで任意宛先に送れる作りにはしない）。
export async function POST(req: Request) {
  const { transaction_id, email } = await req.json() as { transaction_id?: string; email?: string };
  if (!transaction_id || !email) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: tx } = await admin
    .from("transactions")
    .select("transaction_id, sender_email, product:products!product_id(type)")
    .eq("transaction_id", transaction_id)
    .maybeSingle();

  if (!tx?.sender_email || tx.sender_email.toLowerCase() !== email.toLowerCase()) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }

  // 連打抑止: 同一メールへ直近 CLAIM_RESEND_INTERVAL_SEC 秒以内に発行済みなら送らない
  const { data: recent } = await admin
    .from("purchase_claim_tokens")
    .select("created_at")
    .eq("email", tx.sender_email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recent && Date.now() - new Date(recent.created_at).getTime() < CLAIM_RESEND_INTERVAL_SEC * 1000) {
    return NextResponse.json(
      { error: "Too many requests", retry_after: CLAIM_RESEND_INTERVAL_SEC },
      { status: 429 },
    );
  }

  const productType = (tx.product as unknown as { type: string | null } | null)?.type ?? null;
  const claimUrl = await issuePurchaseClaimUrl(admin, {
    email: tx.sender_email,
    transactionId: tx.transaction_id,
    redirectPath: claimRedirectPathFor(productType),
  });

  try {
    await sendClaimLinkEmail({ to: tx.sender_email, claimUrl });
  } catch (err) {
    console.error("[claim-resend] メール送信失敗:", err);
    return NextResponse.json({ error: "Send failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
