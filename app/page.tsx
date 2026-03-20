export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white p-8">
      <header className="text-center">
        <h1 className="text-6xl font-extrabold text-orange-500 mb-4 drop-shadow-lg">
          🔥 Direct Cheers
        </h1>
        <p className="text-xl text-slate-300 italic">
          ～ 投げ銭で、現場の熱狂を可視化する ～
        </p>
      </header>

      <main className="mt-12 bg-slate-800 p-8 rounded-2xl border border-slate-700 shadow-2xl max-w-md w-full">
        <h2 className="text-2xl font-bold mb-4 border-b border-slate-600 pb-2">開発ステータス</h2>
        <ul className="space-y-3 text-slate-400">
          <li className="flex items-center">✅ プロジェクト基盤構築 (Next.js)</li>
          <li className="flex items-center">⏳ 決済連携 (Stripe)</li>
          <li className="flex items-center">⏳ リアルタイム演出 (Supabase)</li>
        </ul>
        <button className="mt-8 w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-3 rounded-lg transition-all transform hover:scale-105">
          応援を開始する（準備中）
        </button>
      </main>

      <footer className="mt-auto text-slate-500 text-sm">
        © 2026 Direct Cheers Project - Built by Hiro
      </footer>
    </div>
  )
}