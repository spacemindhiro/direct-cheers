import Stripe from "stripe";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/**
 * チケット・取引（Cheersカード）に対する「本人」の確認。
 *
 * 以前はウォレットのパス発行やウェルカムチアの宛先確定が ticket_id / transaction_id だけで
 * 通っていた。チケットIDはタッチ決済後に子機へ表示するサインアップQRにも載っていたため、
 * 横から読み取った第三者が入場パスを入手・宛先を変更できた（2026-10-11修正）。
 *
 * 本人とみなすのは次のどちらか（画面の呼び出し元2種類に対応）:
 *   1. ログイン中の持ち主（マイチケット・コレクションと同じ条件。ゲスト購入で未紐付けの
 *      行は、ログインメールと購入メールの一致で持ち主とみなす）
 *   2. その決済の Checkout session_id を持っている人（決済直後のサンクス画面）
 */
export type PurchaseAccessor = {
  user?: { id: string; email?: string | null } | null;
  sessionId?: string | null;
};

async function paymentIntentOfSession(sessionId: string | null | undefined): Promise<string | null> {
  if (!sessionId) return null;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
  } catch {
    return null;
  }
}

function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

export async function canAccessTicket(admin: AdminClient, ticketId: string, who: PurchaseAccessor): Promise<boolean> {
  const { data: ticket } = await admin
    .from("tickets")
    .select("holder_profile_id, email, transaction:transactions!transaction_id(stripe_payment_intent_id)")
    .eq("ticket_id", ticketId)
    .maybeSingle();
  if (!ticket) return false;

  const user = who.user;
  if (user) {
    if (ticket.holder_profile_id === user.id) return true;
    if (!ticket.holder_profile_id && sameEmail(ticket.email, user.email)) return true;
  }

  const pi = await paymentIntentOfSession(who.sessionId);
  const ticketPi = (ticket.transaction as { stripe_payment_intent_id?: string | null } | null)?.stripe_payment_intent_id;
  return !!pi && !!ticketPi && pi === ticketPi;
}

export async function canAccessTransaction(admin: AdminClient, transactionId: string, who: PurchaseAccessor): Promise<boolean> {
  const { data: tx } = await admin
    .from("transactions")
    .select("sender_profile_id, sender_email, stripe_payment_intent_id")
    .eq("transaction_id", transactionId)
    .maybeSingle();
  if (!tx) return false;

  const user = who.user;
  if (user) {
    if (tx.sender_profile_id === user.id) return true;
    if (sameEmail(tx.sender_email, user.email)) return true;
  }

  const pi = await paymentIntentOfSession(who.sessionId);
  return !!pi && !!tx.stripe_payment_intent_id && pi === tx.stripe_payment_intent_id;
}
