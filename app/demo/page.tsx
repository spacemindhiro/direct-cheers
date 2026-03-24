'use client';

import React, { useState } from 'react';

export default function DemoPage() {
  const [loading, setLoading] = useState(false);

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 外部の型定義に依存しない pure な fetch
      const response = await fetch('/api/pay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        // SafariのCookie干渉を避ける
        credentials: 'omit', 
      });

      // API側がリダイレクト(303)を返した場合
      if (response.redirected) {
        window.location.href = response.url;
        return;
      }

      // API側がJSONを返した場合
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (data.error) {
        throw new Error(data.error);
      }
    } catch (error: any) {
      console.error("Payment failed", error);
      alert("決済を開始できませんでした: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ 
      display: 'flex', flexDirection: 'column', alignItems: 'center', 
      justifyContent: 'center', minHeight: '100vh', backgroundColor: '#f8f9fa',
      fontFamily: 'sans-serif'
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