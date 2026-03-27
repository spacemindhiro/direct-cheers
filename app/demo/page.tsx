'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
// ✅ QrCodeアイコンは使用しないため、インポートから削除
import { Smartphone, ArrowRight, Zap, Music } from "lucide-react";

export default function DemoEntrancePage() {
  const [qrImageUrl, setQrImageUrl] = useState('');
  const CHEERS_URL = "/demo/cheers";

  useEffect(() => {
    // クライアントサイドで現在のドメインを取得し、QRコードの宛先URLを作成
    if (typeof window !== 'undefined') {
      const host = window.location.origin;
      const targetPath = `${host}${CHEERS_URL}`;
      
      // ✅ 実績のある Google Chart API を使用して、実際に読めるQRコード画像を生成
      // サイズはアイコンと同じく大きく（300x300）、URLをエンコード
      const generatedQr = `https://chart.googleapis.com/chart?cht=qr&chs=300x300&chl=${encodeURIComponent(targetPath)}&choe=UTF-8`;
      setQrImageUrl(generatedQr);
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center px-6 relative overflow-hidden font-sans">
      {/* 背景演出 */}
      <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-pink-500/10 blur-[120px] rounded-full" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/10 blur-[120px] rounded-full" />

      <div className="max-w-md w-full text-center space-y-12 relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-1000">
        
        <div className="space-y-4 px-4">
          <div className="flex justify-center gap-2 mb-2">
            <Music className="text-pink-500 animate-pulse" size={24} />
            <Zap className="text-yellow-400 animate-bounce" size={24} />
          </div>
          <h1 className="text-4xl font-black italic tracking-tighter uppercase leading-none text-pretty">
            Live Venue <br /><span className="text-pink-500">Simulation</span>
          </h1>
          <p className="text-slate-400 text-sm font-bold tracking-widest uppercase opacity-80">
            お手元のスマホでスキャンしてください
          </p>
        </div>

        {/* ✅ 本当に読めるQRコード表示エリア */}
        {/* 実績のあるビジュアル構成（白いパネル、角丸、影）を維持 */}
        <div className="relative group mx-auto w-64 h-64">
          {/* 背後のグロー効果 */}
          <div className="absolute inset-0 bg-pink-500/20 blur-2xl group-hover:bg-pink-500/40 transition-all duration-500" />
          
          {/* QRコード本体のパネル */}
          <div className="relative bg-white p-6 rounded-[2.5rem] shadow-2xl w-full h-full flex flex-col items-center justify-center border-4 border-slate-900 overflow-hidden transition-transform group-hover:scale-[1.02]">
            {qrImageUrl ? (
              // ⚠️ ここが重要：アイコンではなく、生成された本物のQRコード画像
              <img 
                src={qrImageUrl} 
                alt="Scan to Support" 
                className="w-full h-full object-contain"
                // ロード完了を確認するためのログ（デバッグ用）
                onLoad={() => console.log("QR Image Loaded Successfully")}
                onError={() => console.error("QR Image Load Failed")}
              />
            ) : (
              // 画像生成中のプレースホルダー
              <div className="w-full h-full bg-slate-100 animate-pulse rounded-2xl" />
            )}
            {/* テキストも実績通り残す */}
            <div className="mt-2 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
              Scan to Support
            </div>
          </div>

          {/* スマホアイコンのバッジ演出 */}
          <div className="absolute -bottom-4 -right-4 bg-pink-500 p-4 rounded-2xl shadow-xl border-4 border-slate-950 text-white animate-bounce">
            <Smartphone size={24} />
          </div>
        </div>

        <div className="space-y-6 px-4">
          <div className="flex items-center justify-center gap-4 text-slate-500">
            <div className="h-px w-12 bg-slate-800" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em]">Or Click below</span>
            <div className="h-px w-12 bg-slate-800" />
          </div>

          <Link 
            href={CHEERS_URL}
            className="group block w-full bg-slate-900 border border-slate-700 text-white p-6 rounded-[2rem] font-black text-xl hover:bg-white hover:text-slate-950 hover:border-white transition-all shadow-2xl relative overflow-hidden active:scale-95"
          >
            <div className="relative z-10 flex items-center justify-center gap-3 italic uppercase tracking-tighter">
              <span>応援ページを開く</span>
              <ArrowRight className="group-hover:translate-x-2 transition-transform" />
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}