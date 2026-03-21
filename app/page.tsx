"use client";

export default function HomePage() {
  const handleCheckout = async () => {
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

      if (data.url) {
        // Safari対策：URLを正規化してから「assign」で飛ばす
        const stripeUrl = new URL(data.url).toString();
        window.location.assign(stripeUrl);
      } else {
        alert("決済URLが取得できませんでした: " + (data.error || "Unknown error"));
      }
    } catch (err) {
      console.error("Checkout Error:", err);
      alert("通信エラーが発生しました");
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column' }}>
      <h1>Direct Cheers デモ</h1>
      <button 
        onClick={handleCheckout}
        style={{ padding: '20px 40px', fontSize: '20px', cursor: 'pointer', backgroundColor: '#635bff', color: 'white', border: 'none', borderRadius: '8px' }}
      >
        100円で応援する（Stripe決済）
      </button>
      {/* 成功時に表示されるメッセージ */}
      {typeof window !== 'undefined' && window.location.search.includes('success=true') && (
        <p style={{ color: 'green', marginTop: '20px' }}>✅ 決済が成功しました！ありがとうございます！</p>
      )}
    </div>
  );
}