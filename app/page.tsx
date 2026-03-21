export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <main style={{ 
      display: 'flex', flexDirection: 'column', alignItems: 'center', 
      justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif' 
    }}>
      <h1>Direct Cheers Demo</h1>
      
      {/* 修正ポイント：actionの末尾に / をつけない */}
      <form action="/api/pay" method="POST">
        <button 
          type="submit"
          style={{ 
            padding: '20px 40px', fontSize: '1.2rem', fontWeight: 'bold',
            cursor: 'pointer', backgroundColor: '#635bff', color: 'white', 
            borderRadius: '12px', border: 'none'
          }}
        >
          100円で応援する
        </button>
      </form>
    </main>
  );
}