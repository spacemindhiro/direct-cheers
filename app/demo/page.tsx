'use client';

import React, { useState } from 'react';

export default function DemoPage() {
  const [loading, setLoading] = useState(false);

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/api/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || "決済エラー");
      }
    } catch (err: any) {
      alert("エラー: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100vh' }}>
      <form onSubmit={handlePay}>
        <button 
          disabled={loading}
          style={{ padding: '20px 40px', fontSize: '1.5rem', cursor: 'pointer' }}
        >
          {loading ? '通信中...' : '100円で応援する'}
        </button>
      </form>
    </div>
  );
}