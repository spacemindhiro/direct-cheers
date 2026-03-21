'use client';

export default function Home() {
  const handleCheckout = async () => {
    try {
      // 1. サーバー(API)に決済をリクエスト
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "サーバーエラー");
      }

      const data = await response.json();

      // 2. 取得したStripeのURLへリダイレクト（AP/GP/PayPayが統合された画面）
      if (data.url) {
        window.location.href = data.url; 
      } else {
        throw new Error("決済URLが見つかりませんでした。");
      }
    } catch (err: any) {
      console.error("決済エラー:", err);
      alert(`エラーが発生しました: ${err.message}`);
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      height: '100vh',
      fontFamily: 'sans-serif',
      backgroundColor: '#f4f7f6'
    }}>
      <h1 style={{ color: '#333', fontSize: '3rem' }}>🔥 Direct Cheers</h1>
      <p style={{ color: '#666', marginBottom: '30px' }}>爆速投げ銭システム（AP/GP/PayPay対応）</p>
      
      <button 
        onClick={handleCheckout}
        style={{
          padding: '18px 36px',
          fontSize: '22px',
          backgroundColor: '#000',
          color: 'white',
          border: 'none',
          borderRadius: '12px',
          cursor: 'pointer',
          fontWeight: 'bold',
          boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
        }}
      >
        100円送る
      </button>
      
      <p style={{ marginTop: '20px', fontSize: '0.8rem', color: '#999' }}>
        ※テスト環境：カード・PayPay・スマホ決済が試せます
      </p>
    </div>
  );
}