'use client';

import React, { useState } from 'react';
import { Music, Zap, Heart, ShieldCheck, ArrowLeft, MessageSquareHeart, User, Info, AlertCircle } from "lucide-react";
import Link from 'next/link';

export default function ArtistCheersPage() {
  const [nickName, setNickName] = useState('');
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);

  const artist = {
    id: "night-streamer-001",
    name: "NIGHT STREAMER",
    event: "SPACEMIND 2026.03.26",
    image: "https://images.unsplash.com/photo-1516873240891-4bf014598ab4?q=80&w=2070&auto=format&fit=crop"
  };

  const handleStripeCheckout = async (amount: number) => {
    if (loading) return;
    setLoading(true);

    try {
      const response = await fetch('/api/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          amount: amount, 
          artistId: artist.id,
          metadata: {
            nickName: nickName,
            comment: comment,
            artistName: artist.name,
            eventName: artist.event
          }
        }),
      });

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(`エラー: ${data.error}`);
        setLoading(false);
      }
    } catch (error) {
      alert("サーバーとの通信に失敗しました。");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 pb-20 font-sans selection:bg-pink-500/30 overflow-x-hidden">
      {/* ヒーローエリア */}
      <div className="relative h-[45vh] w-full overflow-hidden">
        <img src={artist.image} className="w-full h-full object-cover opacity-60 grayscale" alt={artist.name} />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
        
        <div className="absolute top-6 left-6">
          <Link href="/demo" className="w-10 h-10 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center border border-white/10 text-white hover:bg-pink-500 transition-all">
            <ArrowLeft size={20} />
          </Link>
        </div>

        <div className="absolute bottom-10 left-6 right-6 space-y-4">
          <div className="space-y-1">
            <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.3em] flex items-center gap-1.5 ml-1">
              <User size={12} /> Artist
            </p>
            <h2 className="text-5xl font-black text-white italic tracking-tighter uppercase leading-none drop-shadow-2xl">
              {artist.name}
            </h2>
          </div>

          <div className="space-y-1 border-l-2 border-pink-500/30 pl-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-1.5">
              <Music size={12} /> Playing At
            </p>
            <p className="text-slate-200 text-sm font-bold tracking-tight uppercase">
              {artist.event}
            </p>
          </div>
        </div>
      </div>

      <div className="px-6 -mt-4 relative z-10 space-y-10 max-w-md mx-auto">
        {/* サポートフォーム */}
        <section className="space-y-4">
          <div className="flex justify-between items-end px-1">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2">
              <MessageSquareHeart size={14} className="text-pink-500" /> Support Form
            </h3>
            <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest italic">Optional / 任意</span>
          </div>
          
          <div className="space-y-4 bg-slate-900/80 backdrop-blur-lg p-6 rounded-[2.5rem] border border-slate-800 shadow-2xl">
            <input 
              type="text" 
              value={nickName}
              onChange={(e) => setNickName(e.target.value)}
              placeholder="Your Nickname" 
              className="w-full h-14 bg-slate-950/50 border border-slate-700 rounded-2xl px-5 text-sm text-white focus:border-pink-500 outline-none transition-all placeholder:text-slate-600"
            />
            <textarea 
              value={comment}
              onChange={(e) => setNickName(e.target.value)}
              placeholder="Message to Artist..." 
              rows={2}
              className="w-full bg-slate-950/50 border border-slate-700 rounded-2xl p-5 text-sm text-white focus:border-pink-500 outline-none resize-none transition-all placeholder:text-slate-600"
            />
            {/* デモ用注釈 */}
            <div className="flex gap-2 items-start px-2 py-1">
              <Info size={12} className="text-slate-500 shrink-0 mt-0.5" />
              <p className="text-[9px] text-slate-500 font-medium leading-relaxed italic">
                ※デモ環境ではメッセージは保存されませんが、本番環境では運営事務局よりアーティストへ届けられます。
              </p>
            </div>
          </div>
        </section>

        {/* 決済セクション */}
        <section className="space-y-4">
          <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2 ml-1">
            <Zap size={14} className="text-pink-500" /> Choose Cheers
          </h3>
          
          <div className="grid gap-4">
            {[1000, 3000, 5000].map((val) => (
              <button 
                key={val}
                disabled={loading}
                onClick={() => handleStripeCheckout(val)}
                className="w-full p-7 bg-slate-900 border border-slate-800 rounded-[2.5rem] hover:border-pink-500/50 hover:bg-slate-800/50 transition-all text-left flex justify-between items-center group active:scale-95 disabled:opacity-50 relative overflow-hidden"
              >
                <div className="text-3xl font-black text-white italic tracking-tighter uppercase flex items-baseline gap-1">
                  <span className="text-sm font-bold not-italic text-slate-500">¥</span>
                  {val.toLocaleString()}
                </div>
                <div className="bg-slate-950 p-4 rounded-full group-hover:bg-pink-500 group-hover:text-white transition-all shadow-xl border border-white/5">
                  <Heart size={20} className="group-hover:fill-current" />
                </div>
              </button>
            ))}
          </div>

          {/* 決済に関する重要な注釈 */}
          <div className="bg-amber-500/5 border border-amber-500/20 p-5 rounded-[2rem] flex items-start gap-4">
            <AlertCircle className="text-amber-500 shrink-0 mt-0.5" size={16} />
            <div className="space-y-1">
              <p className="text-[10px] text-amber-500 font-black uppercase tracking-widest italic">Demo Environment</p>
              <p className="text-[10px] text-slate-400 leading-relaxed font-bold tracking-tight uppercase">
                現在はテストモードです。決済ボタンを押しても、Stripeのテスト環境（実課金なし）へ遷移します。
              </p>
            </div>
          </div>
        </section>

        <div className="p-6 bg-slate-900/40 border border-slate-800 rounded-[2.5rem] flex items-start gap-4 shadow-inner">
          <ShieldCheck className="text-emerald-500 shrink-0 mt-1" size={18} />
          <p className="text-[10px] text-slate-500 leading-relaxed font-bold tracking-tight uppercase">
            SECURE CHECKOUT BY STRIPE.
          </p>
        </div>
      </div>
    </div>
  );
}