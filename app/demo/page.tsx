'use client';

import React, { useState } from 'react';

export default function DemoPage() {
  const [loading, setLoading] = useState(false);

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // POSTリクエストを投げる
      const response = await fetch('/api/pay', {
        method: 'POST',
        // SafariのCookie制限を回避するため、認証情報を期待しない設定
        credentials: 'omit', 
      });

      // API側で 303 Redirect が返る場合、fetchはそのURLを追跡します
      if (response.redirected) {
        window.location.href = response.url;
        return;
      }

      // もしJSONで返るように変更した場合はこちら
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error("Payment failed", error);
      alert("決済を開始できませんでした。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ 
      display: 'flex', flexDirection: 'column', alignItems: 'center', 
      justifyContent: 'center', minHeight: '100vh', backgroundColor: '#f8f9fa' 
    }}>
      <h1 style={{ marginBottom: '2rem', color: '#333' }}>Direct Cheers Demo</h1>
      
      <form onSubmit={handlePayment}>
        <button 
          type="submit" 
          disabled={loading}
          style={{ 
            padding: '16px 32px', fontSize: '1.25rem', fontWeight: 'bold',
            backgroundColor: '#635bff', color: 'white', border: 'none',
            borderRadius: '8px', cursor: loading ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
          }}
        >
          {loading ? '準備中...' : '100円で応援する'}
        </button>
      </form>
      
      <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#666' }}>
        ※デモ環境のためログイン不要でテスト可能です
      </p>
    </main>
  );
}