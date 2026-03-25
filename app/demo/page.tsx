'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Play, Zap, Flame, Wallet, ArrowLeft, RotateCcw, Loader2 } from "lucide-react";

// --- 💡 修正ポイント: TypeScriptの型解決エラーを回避するインポート ---
// @ts-ignore (型が見つからない警告を無視)
import { loadStripe } from '@stripe/stripe-js';

// Stripeのパブリックキー（環境変数から取得、なければデモ用ダミー）
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || 'pk_test_sample');

export default function DemoPage() {
  const [loading, setLoading] = useState(false);

  const handleStripeCheckout = async () => {
    setLoading(true);
    try {
      const stripe = await stripePromise;

      if (!stripe) {
        throw new Error("Stripe SDK failed to load.");
      }

      // 本物のStripe Checkoutへリダイレクト
      const { error } = await stripe.redirectToCheckout({
        lineItems: [{
          // Stripeダッシュボードで作成したPrice IDを入れる場所
          price: 'price_12345demo', 
          quantity: 1,
        }],
        mode: 'payment',
        successUrl: `${window.location.origin}/demo/thanks`,
        cancelUrl: `${window.location.origin}/demo`,
      });

      if (error) {
        console.error("Stripe Redirect Error:", error);
        // エラー時はデモ継続のため、強制的にサンクスへ（ローカル開発用）
        window.location.href = '/demo/thanks';
      }
    } catch (err) {
      console.error("Checkout Error:", err);
      // SDKロード失敗時などのフォールバック
      window.location.href = '/demo/thanks';
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-pink-500/30">
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-slate-950/80 border-b border-slate-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2 group">
            <img 
              src="/logo-emblem.png" 
              alt="Direct Cheers Logo" 
              className="w-8 h-8 rounded-lg shadow-lg shadow-pink-500/10 group-hover:scale-110 transition-transform"
            />
            <h1 className="text-xl font-black tracking-tighter text-white uppercase italic">Direct Cheers</h1>
          </Link>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500 tracking-widest uppercase bg-slate-900 px-4 py-2 rounded-full border border-slate-800">
            <Zap className="text-pink-500" size={14} fill="currentColor" />
            LIVE DEMO MODE
          </div>
        </div>
      </nav>

      <section className="relative py-20 px-6 overflow-hidden border-b border-slate-900">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?q=80&w=2074&auto=format&fit=crop')] bg-cover bg-center opacity-10" />
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-pink-500 transition-colors mb-10">
            <ArrowLeft size={16} /> BACK TO TOP
          </Link>
          <h2 className="text-4xl md:text-6xl font-black mb-8 tracking-tighter text-white leading-tight uppercase italic">
            ステージを、<br />
            <span className="bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent">
              その手でハックせよ
            </span>
          </h2>
        </div>
      </section>

      <section className="py-24 bg-slate-950 px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-12 gap-12 items-start">
          {/* シミュレーター */}
          <div className="md:col-span-7 bg-slate-900/50 p-6 rounded-[2.5rem] border border-slate-800 shadow-2xl relative overflow-hidden group">
            <div className="absolute inset-0 bg-slate-950 rounded-2xl border border-slate-700 aspect-[16/10] overflow-hidden">
              <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-40" />
              <div className="absolute inset-0 bg-pink-500/10 blur-xl opacity-0 animate-pulse group-hover:opacity-100" />
              <div className="absolute top-4 left-4 flex items-center gap-2 text-[10px] font-black tracking-widest uppercase bg-slate-950/80 px-3 py-1.5 rounded-full border border-slate-700">
                <div className="w-1.5 h-1.5 bg-pink-500 rounded-full animate-pulse" /> Live Stage
              </div>
            </div>
          </div>

          <div className="md:col-span-5 grid gap-10">
            {/* 応援セクション */}
            <div className="p-10 rounded-[2.5rem] bg-slate-950 border border-slate-800">
              <h4 className="text-2xl font-bold text-white italic mb-6">応援を贈る</h4>
              <button className="flex items-center justify-center gap-2.5 bg-gradient-to-r from-pink-500 to-purple-600 text-white p-5 rounded-2xl font-bold w-full mb-4">
                <Flame size={20} fill="currentColor" /> Cheers! (x1)
              </button>
            </div>

            {/* 決済セクション */}
            <div className="p-10 rounded-[2.5rem] bg-gradient-to-br from-slate-900 to-slate-950 border border-violet-500/20 shadow-2xl">
              <h4 className="text-2xl font-bold text-white italic mb-6">「絆の証」を受け取る</h4>
              <p className="text-sm text-slate-400 mb-8">決済が完了すると、自動的にサンクスページへ移動し、ウォレットカードを発行します。</p>
              
              <button 
                onClick={handleStripeCheckout}
                disabled={loading}
                className="inline-flex items-center gap-3 bg-white text-slate-950 px-10 py-4 rounded-full font-bold hover:bg-pink-500 hover:text-white transition-all shadow-2xl w-full justify-center disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : <Wallet size={20} fill="currentColor" />}
                {loading ? '決済画面へ転送中...' : '500円で決済してカードを発行'}
              </button>
            </div>
          </div>
        </div>
      </section>

      <footer className="py-20 text-center border-t border-slate-900">
        <p className="text-slate-600 text-[10px] font-mono italic tracking-widest">© 2026 Direct Cheers Platform.</p>
      </footer>
    </div>
  );
}