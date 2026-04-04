'use client';

import React, { useState } from 'react';
import { 
  Music, Zap, Heart, ShieldCheck, ArrowLeft, 
  MessageSquareHeart, User, Info, AlertCircle, 
  ExternalLink, Tv, Crown, Star, TicketPlus 
} from "lucide-react";
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

  // 2000円のプランのみに限定
  const cheersPlans = [
    { amount: 2000, label: "MESSAGE SEND", detail: "アーティストへメッセージ送信", featureIcon: <MessageSquareHeart size={20} /> },
  ];

  const handleStripeCheckout = async (amount: number, label: string) => {
    if (loading) return;
    setLoading(true);

    try {
      const response = await fetch('/api/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          amount: amount, 
          artistId: artist.id,
          success_url_suffix: `?email={CHECKOUT_SESSION_CUSTOMER_EMAIL}`, 
          metadata: {
            nickName: nickName,
            comment: comment,
            planLabel: label,
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
          <Link href="/demo" className="w-10 h-10 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center border border-white/10 text-white hover:bg-pink-500 transition-all shadow-lg">
            <ArrowLeft size={20} />
          </Link>
        </div>
        <div className="absolute bottom-10 left-6 right-6 space-y-4">
          <div className="space-y-1">
            <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.3em] flex items-center gap-1.5 ml-1">
              <User size={12} /> Artist Profile
            </p>
            <h2 className="text-5xl font-black text-white italic tracking-tighter uppercase leading-none drop-shadow-2xl">{artist.name}</h2>
          </div>
          <div className="space-y-1 border-l-2 border-pink-500/30 pl-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-1.5"><Music size={12} /> Playing At</p>
            <p className="text-slate-200 text-sm font-bold tracking-tight uppercase">{artist.event}</p>
          </div>
        </div>
      </div>

      <div className="px-6 -mt-4 relative z-10 space-y-10 max-w-md mx-auto">
        
        {/* 審査用バイパスリンク */}
        <section className="px-2">
          <Link href="/demo/thanks?email=bypass-test@spacemind.jp" className="flex items-center justify-between p-5 bg-slate-900 border border-pink-500/40 rounded-[2.5rem] hover:bg-slate-800 transition-all group shadow-[0_0_25px_rgba(236,72,153,0.15)]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-pink-500/10 rounded-full flex items-center justify-center text-pink-500 border border-pink-500/20">
                <ShieldCheck size={20} />
              </div>
              <div className="space-y-0.5">
                <span className="text-[10px] font-black text-white uppercase tracking-widest block">Deliverable Preview</span>
                <span className="text-[8px] font-bold text-slate-500 uppercase tracking-tighter italic leading-none text-wrap">審査用：提供商品を確認</span>
              </div>
            </div>
            <ExternalLink size={14} className="text-slate-500 group-hover:text-pink-500 transition-all" />
          </Link>
        </section>

        {/* サポートフォーム */}
        <section className="space-y-4">
          <div className="flex justify-between items-end px-1">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2"><MessageSquareHeart size={14} className="text-pink-500" /> Support Form</h3>
            <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest italic font-mono">Optional</span>
          </div>
          <div className="space-y-4 bg-slate-900/80 backdrop-blur-lg p-6 rounded-[2.5rem] border border-slate-800 shadow-2xl">
            <input type="text" value={nickName} onChange={(e) => setNickName(e.target.value)} placeholder="Nickname" className="w-full h-14 bg-slate-950/50 border border-slate-700 rounded-2xl px-5 text-sm text-white focus:border-pink-500 outline-none transition-all placeholder:text-slate-700 font-bold" />
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Message to Artist..." rows={2} className="w-full bg-slate-950/50 border border-slate-700 rounded-2xl p-5 text-sm text-white focus:border-pink-500 outline-none resize-none transition-all placeholder:text-slate-700 font-bold" />
          </div>
        </section>

        {/* 決済セクション */}
        <section className="space-y-6">
          <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2 ml-1"><Zap size={14} className="text-pink-500" /> Send Cheers </h3>
          
          <div className="grid gap-3">
            {cheersPlans.map((plan) => (
              <button 
                key={plan.amount}
                disabled={loading}
                onClick={() => handleStripeCheckout(plan.amount, plan.label)}
                className="w-full p-5 bg-slate-900 border border-slate-800 rounded-[2.2rem] hover:border-pink-500/50 hover:bg-slate-800 transition-all text-left flex items-center group active:scale-[0.97] relative overflow-hidden shadow-xl"
              >
                {/* 左側：機能アイコン */}
                <div className="bg-slate-950 w-12 h-12 rounded-2xl flex items-center justify-center text-slate-500 group-hover:text-pink-400 border border-white/5 transition-colors">
                  {plan.featureIcon}
                </div>

                {/* 中央：プラン情報 */}
                <div className="ml-4 flex-1">
                  <span className="text-[10px] font-black text-pink-500 uppercase tracking-[0.15em] block">{plan.label}</span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-[10px] font-bold text-slate-500 italic uppercase tracking-tighter leading-none">{plan.detail}</span>
                  </div>
                  <div className="text-2xl font-black text-white italic tracking-tighter uppercase mt-1 flex items-baseline gap-0.5">
                    <span className="text-[10px] font-bold not-italic text-slate-500">¥</span>
                    {plan.amount.toLocaleString()}
                  </div>
                </div>

                {/* 右側：ハート配置 */}
                <div className="ml-2 w-14 h-14 bg-slate-950/50 group-hover:bg-pink-500 rounded-[1.5rem] flex items-center justify-center text-slate-700 group-hover:text-white border border-white/5 transition-all shadow-inner group-hover:shadow-[0_0_20px_rgba(236,72,153,0.4)]">
                  <Heart size={24} className="group-hover:fill-current group-active:scale-125 transition-transform" />
                </div>
              </button>
            ))}
          </div>

          <div className="bg-amber-500/5 border border-amber-500/20 p-5 rounded-[2rem] flex items-start gap-4">
            <AlertCircle className="text-amber-500 shrink-0 mt-0.5" size={16} />
            <p className="text-[10px] text-slate-400 leading-relaxed font-bold tracking-tight uppercase italic">Sandbox Mode Active. No real charges.</p>
          </div>
        </section>

        {/* セキュリティ表示 */}
        <div className="flex flex-col items-center gap-4 py-4 opacity-50">
          <div className="flex items-center gap-2">
            <ShieldCheck size={14} className="text-emerald-500" />
            <span className="text-[9px] font-black uppercase tracking-[0.3em]">Secure Checkout by Stripe</span>
          </div>
        </div>
      </div>
    </div>
  );
}