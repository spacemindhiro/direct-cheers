import { NextResponse } from "next/server";
import Stripe from "stripe";

// 【根本対処1】このAPIはビルド時に解析させず、常に実行時に動かすことを明示
export const dynamic = "force-dynamic";

// 【根本対処2】Stripeの初期化。apiVersionは型エラーを避けるため指定しない
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin") || "https://direct-cheers.com";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "jpy",
            product_data: { name: "応援の気持ち" },
            unit_amount: 100,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      // 【根本対処3】Safariのキャッシュを物理的に無効化するクエリを付与
      success_url: `${origin}?v=${Date.now()}&status=success`,
      cancel_url: `${origin}?v=${Date.now()}&status=cancel`,
    });

    if (!session.url) {
      throw new Error("Stripe Session URL generation failed.");
    }

    // 【根本対処4】303 See Other を使用。
    // Safariに「以前のURL（/auth/login）は忘れろ」と強制的に命令するコードです。
    return NextResponse.redirect(session.url, 303);

  } catch (err: any) {
    console.error("Payment Error:", err);
    return NextResponse.json(
      { error: "Payment initialization failed" },
      { status: 500 }
    );
  }
}