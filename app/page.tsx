"use client";

export default function HomePage() {
  const handleCheckout = async () => {
    try {
      // 1. Safari対策：キャッシュを無効化し、リダイレクトを明示的に許可
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache' // Safariのキャッシュ防止
        },
        cache: 'no-store'
      });

      // 2. 通信自体が成功したかチェック
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`サーバーエラー: ${response.status} ${errorText}`);
      }

      const data = await response.json();

      if (data.url) {
        // 3. Safariの「Pattern match」エラーを殺す絶対URL化
        const stripeUrl = new URL(data.url).href;
        
        // 4. Safariで最も安定する遷移方法
        window.location.replace(stripeUrl); 
      } else {
        alert("決済URLが見つかりません");
      }
    } catch (err: any) {
      console.error("Safari Error:", err);
      // 詳細を出すことで原因を特定
      alert("通信エラー詳細: " + err.message);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', gap: '20px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>🔥 Direct Cheers Demo</h1>
      <button 
        onClick={handleCheckout}
        style={{ padding: '20px 40px', fontSize: '20px', cursor: 'pointer', backgroundColor: '#635bff', color: 'white', border: 'none', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
      >
        100円で応援する
      </button>
      
      {typeof window !== 'undefined' && window.location.search.includes('success=true') && (
        <div style={{ padding: '15px', backgroundColor: '#e6fffa', border: '1px solid #38a169', borderRadius: '8px', color: '#2f855a' }}>
          ✅ 決済成功！デモ完了です！
        </div>
      )}
    </div>
  );
}