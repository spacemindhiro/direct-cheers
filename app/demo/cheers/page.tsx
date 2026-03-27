'use client';

import React, { useState } from 'react';
import { Music, Zap, Heart, ShieldCheck, ArrowLeft, User, MessageSquareHeart } from "lucide-react";
import Link from 'next/link';

export default function ArtistCheersPage() {
  // アーティスト情報は固定
  const artist = {
    id: "demo-artist-001",
    name: "D-Cheers Collective",
    event: "Tech & Vibes Live 2026",
    image: "https://images.unsplash.com/photo-1493225255756-d9584f8606e9?q=80&w=2070&auto=format&fit=crop"
  };

  const [nickName, setNickName] = useState('');
  const [comment, setComment] = useState('');

  // ✅ Stripe Checkout への遷移ロジック
  const handleStripeCheckout = async (priceId: string) => {
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          priceId, 
          artistId: artist.id,
          metadata: {
            nickName: nickName || 'Guest',
            comment: comment || ''
          }
        }),
      });
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error("Stripe Checkout error:", error);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 pb-20 font-sans selection:bg-pink-500/30 overflow-x-hidden">
      {/* Hero Section */}
      <div className="relative h-[40vh] w-full overflow-hidden">
        <img src={artist.image} className="w-full h-full object-cover opacity-60 grayscale hover:grayscale-0 transition-all duration-1000" alt="Artist" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
        <div className="absolute top-6 left-6">
          <Link href="/demo" className="w-10 h-10 bg-black/20 backdrop-blur-md rounded-full flex items-center justify-center border border-white/10 text-white hover:bg-pink-500 hover:border-pink-500 transition-colors">
            <ArrowLeft size={20} />
          </Link>
        </div>
        <div className="absolute bottom-8 left-6 right-6">
          <span className="bg-pink-500 text-white text-[10px] font-black px-2 py-1 rounded uppercase italic mb-3 inline-block tracking-widest animate-pulse">Now Performing</span>
          <h2 className="text-4xl md:text-5xl font-black text-white italic tracking-tighter uppercase leading-none">{artist.name}</h2>
          <p className="text-slate-400 text-sm font-bold mt-3 flex items-center gap-2">
            <Music size={14} className="text-pink-500" /> {artist.event}
          </p>
        </div>
      </div>

      <div className="px-6 mt-10 space-y-12 max-w-md mx-auto">
        {/* Message Form Section */}
        <section className="space-y-6">
          <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2">
            <MessageSquareHeart size={14} className="text-pink-500" /> Message (Optional)
          </h3>
          <div className="space-y-4 bg-slate-900 p-6 rounded-[2rem] border border-slate-800 shadow-inner">
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
              <input 
                type="text" 
                value={nickName}
                onChange={(e) => setNickName(e.target.value)}
                placeholder="お名前（ニックネーム）" 
                className="w-full h-12 bg-slate-950 border border-slate-700 rounded-xl pl-12 pr-4 text-sm text-white focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none transition-colors"
              />
            </div>
            <div className="relative">
              <textarea 
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="応援コメントをどうぞ" 
                rows={3}
                maxLength={200}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-sm text-white focus:border-pink-500 focus:ring-1 focus:ring-pink-500 outline-none transition-colors resize-none"
              />
            </div>
            <p className="text-[10px] text-slate-600 text-center font-bold tracking-tight">
              ※本番ではこのメッセージがアーティストに届きます
            </p>
          </div>
        </section>

        {/* Amount Selection Section */}
        <section className="space-y-6">
          <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2">
            <Zap size={14} className="text-pink-500" /> Cheers Selection
          </h3>
          <div className="grid gap-4">
            {[
              { id: 'price_demo_1000', amount: 1000, label: "Casual Cheers" },
              { id: 'price_demo_3000', amount: 3000, label: "Great Support" },
              { id: 'price_demo_5000', amount: 5000, label: "Maximum Vibes" },
            ].map((item) => (
              <button 
                key={item.id}
                onClick={() => handleStripeCheckout(item.id)}
                className="w-full p-6 bg-slate-900 border border-slate-800 rounded-[2rem] hover:border-pink-500 transition-all text-left flex justify-between items-center group active:scale-95 shadow-xl shadow-black/20"
              >
                <div>
                  <div className="text-2xl font-black text-white italic tracking-tighter uppercase">¥{item.amount.toLocaleString()}</div>
                  <div className="text-[10px] text-slate-500 font-bold uppercase mt-1 tracking-widest">{item.label}</div>
                </div>
                <div className="bg-white/5 p-4 rounded-full group-hover:bg-pink-500 group-hover:text-white transition-all">
                  <Heart size={20} className="group-hover:fill-current" />
                </div>
              </button>
            ))}
          </div>
        </section>

        <div className="p-6 bg-slate-900/40 border border-slate-800 rounded-[2rem] flex items-start gap-4 shadow-inner">
          <ShieldCheck className="text-indigo-500 shrink-0 mt-1" size={18} />
          <p className="text-[10px] text-slate-500 leading-relaxed font-bold tracking-tight uppercase">
            SECURE CHECKOUT BY STRIPE.<br />
            決済完了後、支援証が自動発行されます。
          </p>
        </div>
      </div>
    </div>
  );
}