// 修正後のコード
export async function POST(request: Request) {
  // ★重要: 今アクセスしているドメインをリクエストから直接取る
  const { origin } = new URL(request.url);

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'paypay'],
      line_items: [{
        price_data: {
          currency: 'jpy',
          product_data: { name: '🔥 Direct Cheers (Demo)' },
          unit_amount: 100,
        },
        quantity: 1,
      }],
      mode: 'payment',
      // ★修正: /success ではなく /?success=true にする（新しいページを作らなくて済む）
      success_url: `${origin}/?success=true`,
      cancel_url: `${origin}/`,
    });

    return NextResponse.json({ url: session.url });