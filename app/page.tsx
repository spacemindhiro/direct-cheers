"use client";

export default function Page() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100vh' }}>
      {/* fetchを使わず、標準のPOSTフォームで飛ばす */}
      <form action="/api/pay/" method="POST">
        <button 
          type="submit"
          style={{ padding: '20px 40px', fontSize: '20px', cursor: 'pointer', backgroundColor: '#635bff', color: 'white', borderRadius: '8px', border: 'none' }}
        >
          100円で応援する
        </button>
      </form>
    </div>
  );
}