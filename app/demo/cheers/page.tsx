'use client';

import React, { useState } from 'react';
import { Music, Zap, Heart, ShieldCheck, ArrowLeft, MessageSquareHeart, User, Info, AlertCircle, ExternalLink, Sparkles, Radio, Tv, Crown, Star, TicketPlus } from "lucide-react";
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

  // 💡 価値基準に基づいたプラン定義
  const cheersPlans = [
    { amount: 1000, label: "DIGITAL CARD", detail: "デジタル証明書のみ（基本）", icon: <ShieldCheck size={18} /> },
    { amount: 2000, label: "MESSAGE SEND", detail: "アーティストへメッセージ送信権", icon: <MessageSquareHeart size={18} /> },
    { amount: 3000, label: "FLOOR GIMMICK", detail: "会場内のIoT演出をリアルタイム起動", icon: <Zap size={18} /> },
    { amount: 5000, label: "PUBLIC VISION", detail: "大型ビジョンへのメッセージ表示", icon: <Tv size={18} /> },
    { amount: 10000, label: "VIP ACCESS", detail: "制限エリア（VIP/楽屋等）への入室権", icon: <Crown size={18} /> },
    { amount: 20000, label: "MEET & GREET", detail: "アーティストとの直接交流・記念撮影", icon: <Star size={18} /> },
    { amount: 30000, label: "ULTIMATE PASS", detail: "次回ペア招待 ＋ 限定アセット付与", icon: <TicketPlus size={18} /> },
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
            planLabel: label, // 💡 どのプランを選んだかをStripeに送る
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
      {/* ヒーローエリア (変更なし) */}
      <div className="relative h-[40vh] w-full overflow-hidden">
        <img src={artist.image} className="w-full h-full object-cover opacity-50 grayscale" alt={artist.name} />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
        <div className="absolute top-6 left-6">
          <Link href="/demo" className="w-10 h-10 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center border border-white/10 text-white hover:bg-pink-500 transition-all">
            <ArrowLeft size={20} />
          </Link>
        </div>
        <div className="absolute bottom-8 left-6 right-6">
          <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.3em] mb-1">Artist</p>
          <h2 className="text-4xl font-black text-white italic tracking-tighter uppercase leading-none">{artist.name}</h2>
          <p className="text-slate-400 text-[10px] font-bold tracking-widest uppercase mt-2">{artist.event}</p>
        </div>
      </div>

      <div className="px-6 -mt-6 relative z-10 space-y-8 max-w-md mx-auto">
        
        {/* サポートフォーム */}
        <section className="space-y-4">
          <div className="bg-slate-900/80 backdrop-blur-lg p-5 rounded-[2rem] border border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 px-1">
              <MessageSquareHeart size={14} className="text-pink-500" />
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Support Information</h3>
            </div>
            <input 
              type="text" 
              value={nickName}
              onChange={(e) => setNickName(e.target.value)}
              placeholder="Nickname (Displayed on Screen)" 
              className="w-full h-12 bg-slate-950/50 border border-slate-700 rounded-xl px-4 text-sm text-white focus:border-pink-500 outline-none transition-all placeholder:text-slate-700"
            />
            <textarea 
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Message to Floor / Artist..." 
              rows={2}
              className="w-full bg-slate-950/50 border border-slate-700 rounded-xl p-4 text-sm text-white focus:border-pink-500 outline-none resize-none transition-all placeholder:text-slate-700"
            />
          </div>
        </section>

        {/* 決済セクション（価値適合ボタン） */}
        <section className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2">
              <Zap size={14} className="text-pink-500" /> Choose Your Impact
            </h3>
          </div>
          
          <div className="grid gap-3">
            {cheersPlans.map((plan) => (
              <button 
                key={plan.amount}
                disabled={loading}
                onClick={() => handleStripeCheckout(plan.amount, plan.label)}
                className="w-full p-5 bg-slate-900 border border-slate-800 rounded-2xl hover:border-pink-500/50 hover:bg-slate-800 transition-all text-left flex items-center group active:scale-[0.98] disabled:opacity-50"
              >
                <div className="bg-slate-950 w-12 h-12 rounded-xl flex items-center justify-center text-slate-500 group-hover:text-pink-500 border border-white/5 transition-colors shadow-inner">
                  {plan.icon}
                </div>
                <div className="ml-4 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[10px] font-black text-pink-500 uppercase tracking-widest">{plan.label}</span>
                    <div className="h-px flex-1 bg-slate-800" />
                    <span className="text-lg font-black text-white italic tracking-tighter">
                      <span className="text-[10px] not-italic text-slate-500 mr-0.5">¥</span>
                      {plan.amount.toLocaleString()}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-bold mt-0.5 uppercase tracking-tight">{plan.detail}</p>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* 安全・デモ表示 */}
        <div className="space-y-4">
          <div className="p-5 bg-amber-500/5 border border-amber-500/10 rounded-2xl flex items-start gap-4">
            <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={14} />
            <p className="text-[9px] text-slate-500 leading-relaxed font-bold uppercase tracking-tight italic">
              Currently in Sandbox mode. No real charges will be made.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 py-4">
            <ShieldCheck className="text-emerald-500/50" size={14} />
            <span className="text-[9px] text-slate-600 font-black uppercase tracking-[0.2em]">Secure Checkout by Stripe</span>
          </div>
        </div>
      </div>
    </div>
  );
}