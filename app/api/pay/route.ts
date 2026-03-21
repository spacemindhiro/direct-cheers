import { NextResponse } from "next/server";

// ビルド時の静的解析を物理的にバイパス
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    // 【重要】ビルドプロセスはこの中身を解析しません。
    // サーバーが起動し、リクエストが来た瞬間にだけ Stripe を読み込みます。
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

    const origin = request.headers.get("origin") || "https://direct-cheers.com";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "jpy",
          product_data: { name: "応援の気持ち" },
          unit_amount: 100,
        },
        quantity: 1,
      }],
      mode: "payment",
      success_url: `${origin}/?status=success`,
      cancel_url: `${origin}/?status=cancel`,
    });

    // Safariのリダイレクトキャッシュを破壊する 303
    return NextResponse.redirect(session.url!, 303);

  } catch (err: any) {
    return NextResponse.json({ error: "Checkout Failed" }, { status: 500 });
  }
}