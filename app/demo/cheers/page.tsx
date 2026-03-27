'use client';

import React from 'react';
import { Music, Zap, Heart, ShieldCheck, ArrowLeft } from "lucide-react";
import Link from 'next/link';

export default function ArtistCheersPage() {
  // アーティスト情報は完全に固定
  const artist = {
    id: "demo-artist-001",
    name: "D-Cheers Collective",
    event: "Tech & Vibes Live 2026",
    image: "https://images.unsplash.com/photo-1493225255756-d9584f8606e9?q=80&w=2070&auto=format&fit=crop"
  };

  const handleStripeCheckout = async (priceId: string) => {
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          priceId, 
          artistId: artist.id,
          // Stripeから戻る先を /demo/thanks に指定
          successUrl: '/demo/thanks' 
        }),
      });
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error("Checkout failed:", error);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 pb-20 font-sans selection:bg-pink-500/30">
      <div className="relative h-[45vh] w-full overflow-hidden">
        <img src={artist.image} className="w-full h-full object-cover opacity-60 grayscale" alt="Artist" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
        
        <div className="absolute top-6 left-6">
          <Link href="/demo" className="w-10 h-10 bg-black/20 backdrop-blur-md rounded-full flex items-center justify-center border border-white/10 text-white">
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

      <div className="px-6 mt-10 space-y-10 max-w-md mx-auto">
        <div className="space-y-4">
          <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2">
            <Zap size={14} className="text-pink-500" /> Select Your Cheers
          </h3>
          
          <div className="grid gap-4">
            {[
              { id: 'price_demo_500', amount: 500, label: "Casual Cheers" },
              { id: 'price_demo_2000', amount: 2000, label: "Great Support" },
              { id: 'price_demo_5000', amount: 5000, label: "Maximum Vibes" },
            ].map((item) => (
              <button 
                key={item.id}
                onClick={() => handleStripeCheckout(item.id)}
                className="w-full p-6 bg-slate-900 border border-slate-800 rounded-[2.5rem] hover:border-pink-500 transition-all text-left flex justify-between items-center group active:scale-95 shadow-xl shadow-black/20"
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
        </div>

        <div className="p-6 bg-slate-900/40 border border-slate-800 rounded-[2rem] flex items-start gap-4">
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