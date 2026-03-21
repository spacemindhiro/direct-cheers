"use client";

export default function Page() {
  const checkout = async () => {
    try {
      const res = await fetch('/api/pay', { method: 'POST' });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (e) { alert("通信エラー"); }
  };

  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100vh' }}>
      <button onClick={checkout} style={{ padding: '20px', fontSize: '20px', cursor: 'pointer' }}>
        100円で応援する
      </button>
    </div>
  );
}