'use client';

// 1. 部品のインポート（必ず一番上！）
import { loadStripe } from '@stripe/stripe-js';

export default function Home() {
  // 2. ボタンを押した時の処理
  const handleCheckout = async () => {
    // ストライプの公開鍵を読み込む（.env.local から取得）
    const stripe = await loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

    if (!stripe) {
      alert("Stripeの読み込みに失敗しました。");
      return;
    }

    // 今はまだ「準備完了」のアラートだけ出す
    alert("接続確認OK！次はここに本物の決済画面を呼び出す処理を書きます。");
  };

  // 3. 画面の見た目（HTML）
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
      <p style={{ color: '#666', marginBottom: '30px' }}>キャッシュレス投げ銭で、現場の熱狂を、ダイレクトに届けよう。</p>
      
      <button 
        onClick={handleCheckout}
        style={{
          padding: '18px 36px',
          fontSize: '22px',
          backgroundColor: '#635bff', // Stripeカラーの紫
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontWeight: 'bold',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          transition: 'transform 0.2s'
        }}
        onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
        onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
      >
        100円送る（テストモード）
      </button>
      
      <p style={{ marginTop: '20px', fontSize: '0.8rem', color: '#999' }}>
        ※テストモードのため、実際にお金はかかりません。
      </p>
    </div>
  );
}