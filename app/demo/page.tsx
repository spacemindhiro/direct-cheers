'use client';

import React, { useState } from 'react';

export default function DemoPage() {
  const [loading, setLoading] = useState(false);

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/pay', {
        method: 'POST',
        // Safariのエラーを避けるため最小限の設定に
      });

      // レスポンスがJSONでない場合（500エラー等）のハンドリング
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error("Server returned non-JSON response: " + text.substring(0, 100));
      }

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || "Unknown error");
      }
    } catch (error: any) {
      console.error("Payment failed", error);
      alert("決済エラー:\n" + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ display: 'grid', placeItems: 'center', height: '100vh', fontFamily: 'sans-serif' }}>
      <form onSubmit={handlePayment}>
        <button 
          disabled={loading}
          style={{ padding: '20px 40px', fontSize: '1.2rem', cursor: loading ? 'wait' : 'pointer', backgroundColor: '#635bff', color: 'white', border: 'none', borderRadius: '8px' }}
        >
          {loading ? '通信中...' : '100円で応援する'}
        </button>
      </form>
    </main>
  );
}