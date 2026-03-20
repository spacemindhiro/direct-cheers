export default function SuccessPage() {
  return (
    <div style={{ textAlign: 'center', marginTop: '100px', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: '3rem', color: '#635bff' }}>🎉 決済完了！</h1>
      <p style={{ fontSize: '1.2rem' }}>100円の応援、確かに受け取りました。</p>
      <p>あなたの支援が、クリエイターの力になり、シーンの発展につながります。</p>
      <a href="/" style={{ color: '#635bff', textDecoration: 'none', fontWeight: 'bold' }}>
        ← トップへ戻る
      </a>
    </div>
  );
}