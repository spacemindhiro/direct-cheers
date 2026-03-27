'use client';

import React, { useState } from 'react';
import { Music, Zap, Heart, ShieldCheck, ArrowLeft, User, MessageSquareHeart } from "lucide-react";
import Link from 'next/link';

export default function ArtistCheersPage() {
  const artist = {
    id: "demo-artist-001",
    name: "D-Cheers Collective",
    event: "Tech & Vibes Live 2026",
    image: "https://images.unsplash.com/photo-1493225255756-d9584f8606e9?q=80&w=2070&auto=format&fit=crop"
  };

  const [nickName, setNickName] = useState('');
  const [comment, setComment] = useState('');

  // ✅ Stripe決済実行
  const handleStripeCheckout = async (amount: number) => {
    try {
      const response = await fetch('/api/pay', { // APIパスを /api/pay に統一
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          amount: amount, 
          artistId: artist.id,
          metadata: {
            nickName: nickName || 'Guest',
            comment: comment || ''
          }
        }),
      });

      const data = await response.json();

      if (data.url) {
        // --- ✅ ここでブラウザの画面をStripeへ切り替える ---
        window.location.href = data.url;
      } else {
        alert("決済URLの取得に失敗しました。");
      }
    } catch (error) {
      console.error("Checkout error:", error);
      alert("通信エラーが発生しました。");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 pb-20 font-sans selection:bg-pink-500/30">
      {/* Hero Section */}
      <div className="relative h-[40vh] w-full overflow-hidden">
        <img src={artist.image} className="w-full h-full object-cover opacity-60" alt="Artist" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 to-transparent" />
        <div className="absolute top-6 left-6">
          <Link href="/demo" className="w-10 h-10 bg-black/20 backdrop-blur-md rounded-full flex items-center justify-center border border-white/10 text-white">
            <ArrowLeft size={20} />
          </Link>
        </div>
        <div className="absolute bottom-8 left-6 right-6">
          <h2 className="text-4xl font-black text-white italic tracking-tighter uppercase leading-none">{artist.name}</h2>
          <p className="text-slate-400 text-sm font-bold mt-3 flex items-center gap-2">
            <Music size={14} className="text-pink-500" /> {artist.event}
          </p>
        </div>
      </div>

      <div className="px-6 mt-10 space-y-10 max-w-md mx-auto">
        {/* Form */}
        <section className="space-y-4">
          <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2">
            <MessageSquareHeart size={14} className="text-pink-500" /> Message
          </h3>
          <div className="space-y-3 bg-slate-900 p-5 rounded-[2rem] border border-slate-800">
            <input 
              type="text" 
              value={nickName}
              onChange={(e) => setNickName(e.target.value)}
              placeholder="お名前（任意）" 
              className="w-full h-12 bg-slate-950 border border-slate-700 rounded-xl px-4 text-sm text-white focus:border-pink-500 outline-none"
            />
            <textarea 
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="コメント（任意）" 
              rows={2}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-sm text-white focus:border-pink-500 outline-none resize-none"
            />
          </div>
        </section>

        {/* Amount */}
        <section className="space-y-4">
          <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2">
            <Zap size={14} className="text-pink-500" /> Cheers
          </h3>
          <div className="grid gap-4">
            {[1000, 3000, 5000].map((val) => (
              <button 
                key={val}
                onClick={() => handleStripeCheckout(val)}
                className="w-full p-6 bg-slate-900 border border-slate-800 rounded-[2rem] hover:border-pink-500 transition-all text-left flex justify-between items-center group active:scale-95"
              >
                <span className="text-2xl font-black text-white italic">¥{val.toLocaleString()}</span>
                <Heart size={20} className="text-slate-700 group-hover:text-pink-500 group-hover:fill-current transition-all" />
              </button>
            ))}
          </div>
        </section>

        <div className="p-6 bg-slate-900/40 border border-slate-800 rounded-[2rem] flex items-start gap-4">
          <ShieldCheck className="text-indigo-500 shrink-0 mt-1" size={18} />
          <p className="text-[10px] text-slate-500 leading-relaxed font-bold tracking-tight uppercase">
            SECURE CHECKOUT BY STRIPE.
          </p>
        </div>
      </div>
    </div>
  );
}