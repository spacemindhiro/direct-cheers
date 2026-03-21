// セッション作成の部分に「expires_at」や「metadata」を足して、毎回「新品」であることを保証する
const session = await stripe.checkout.sessions.create({
  payment_method_types: ["card"],
  line_items: [{
    price_data: {
      currency: "jpy",
      product_data: { name: "応援" },
      unit_amount: 100,
    },
    quantity: 1,
  }],
  mode: "payment",
  success_url: "https://direct-cheers.com/",
  cancel_url: "https://direct-cheers.com/",
  // 【追加】毎回新しいリクエストであることをStripeに強制認識させるためのランダム値
  client_reference_id: `order_${Date.now()}`, 
});