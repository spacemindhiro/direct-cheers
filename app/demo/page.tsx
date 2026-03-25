'use client';

import React, { useState } from 'react';

export default function DemoPage() {
  const [loading, setLoading] = useState(false);

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/pay', { method: 'POST' });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server Error: ${response.status} - ${errorText.substring(0, 100)}`);
      }

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || "No URL returned");
      }
    } catch (error: any) {
      console.error(error);
      alert("決済エラーが発生しました:\n" + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ display: 'grid', placeItems: 'center', height: '100vh', fontFamily: 'sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ marginBottom: '20px' }}>Direct Cheers Demo</h1>
        <form onSubmit={handlePayment}>
          <button 
            disabled={loading}
            style={{ 
              padding: '20px 40px', fontSize: '1.2rem', fontWeight: 'bold',
              backgroundColor: '#635bff', color: 'white', border: 'none',
              borderRadius: '8px', cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? '通信中...' : '100円で決済テスト'}
          </button>
        </form>
      </div>
    </main>
  );
}