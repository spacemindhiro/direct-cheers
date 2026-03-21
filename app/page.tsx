"use client";

export default function Page() {
  return (
    <main style={{ 
      display: 'flex', 
      flexDirection: 'column',
      alignItems: 'center', 
      justifyContent: 'center', 
      height: '100vh',
      fontFamily: 'sans-serif' 
    }}>
      <h1 style={{ marginBottom: '20px' }}>Direct Cheers Demo</h1>
      
      {/* 【重要】fetchを使わず、ブラウザ標準のForm機能でPOSTします。
        これが最もSafariのセキュリティに干渉されにくい、枯れた技術です。
      */}
      <form action="/api/pay/" method="POST">
        <button 
          type="submit"
          style={{ 
            padding: '20px 40px', 
            fontSize: '1.2rem', 
            fontWeight: 'bold',
            cursor: 'pointer', 
            backgroundColor: '#635bff', 
            color: 'white', 
            borderRadius: '12px', 
            border: 'none',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
          }}
        >
          100円で応援する
        </button>
      </form>

      <p style={{ marginTop: '20px', color: '#666' }}>
        ※ボタンを押すとStripeの決済画面に飛びます
      </p>
    </main>
  );
}