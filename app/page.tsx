'use client';

import { loadStripe } from '@stripe/stripe-js';

export default function Home() {
  const handleCheckout = async () => {
    try {
      // 1. Stripeの公開鍵を読み込む
      const stripe = await loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

      if (!stripe) {
        throw new Error("Stripeの読み込みに失敗しました。公開鍵を確認してください。");
      }

      // 2. サーバー(API)に決済セッションを要求
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "サーバーエラーが発生しました。");
      }

      const session = await response.json();

      // 3. 取得したセッションIDを使って決済画面へジャンプ
      if (session.id) {
        const { error } = await (stripe as any).redirectToCheckout({
          sessionId: session.id,
        });
        if (error) throw error;
      } else {
        throw new Error("決済セッションIDが取得できませんでした。");
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
      <p style={{ color: '#666', marginBottom: '30px' }}>現場の熱狂を、ダイレクトに届けよう。</p>
      
      <button 
        onClick={handleCheckout}
        style={{
          padding: '18px 36px',
          fontSize: '22px',
          backgroundColor: '#635bff',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontWeight: 'bold',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        }}
      >
        100円送る（テストモード）
      </button>
      
      <p style={{ marginTop: '20px', fontSize: '0.8rem', color: '#999' }}>
        ※テストモード：カード番号「4242 4242...」で決済を試せます。
      </p>
    </div>
  );
}