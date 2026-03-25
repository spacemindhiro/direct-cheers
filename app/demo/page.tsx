'use client';

import React, { useState } from 'react';

export default function DemoPage() {
  const [loading, setLoading] = useState(false);

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/pay', { method: 'POST' });
      const text = await response.text();
      
      let data;
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        throw new Error("サーバーレスポンスが不正です (JSON parse error)");
      }

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || "決済URLを取得できませんでした");
      }
    } catch (error: any) {
      console.error("Payment failed", error);
      alert("決済エラー:\n" + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ display: 'grid', placeItems: 'center', height: '100vh', fontFamily: 'sans-serif', backgroundColor: '#fcfcfc' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ marginBottom: '30px' }}>Direct Cheers Demo</h1>
        <form onSubmit={handlePayment}>
          <button 
            disabled={loading}
            style={{ 
              padding: '20px 50px', fontSize: '1.4rem', fontWeight: 'bold',
              backgroundColor: '#635bff', color: 'white', border: 'none',
              borderRadius: '12px', cursor: loading ? 'wait' : 'pointer',
              boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
            }}
          >
            {loading ? '通信中...' : '100円で応援する'}
          </button>
        </form>
        <p style={{ marginTop: '20px', color: '#888' }}>※ログイン不要でテスト可能です</p>
      </div>
    </main>
  );
}