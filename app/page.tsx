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

      // 2. 最新方式：Stripeが発行したURLに直接ジャンプする
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
        ※テストモード：カード番号「4242...」で試せます。
      </p>
    </div>
  );
}