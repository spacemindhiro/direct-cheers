import React from 'react';
import Link from 'next/link';
import { CreditCard, Lock, ArrowRight } from "lucide-react";

export default function StripeDemoCheckout() {
  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        <div className="flex items-center gap-2 mb-12 justify-center">
          <div className="bg-slate-900 text-white p-1 rounded-md text-xs font-bold px-2 py-1">DEMO</div>
          <h1 className="text-slate-500 font-bold tracking-tight">Stripe <span className="text-slate-400 font-medium">Checkout</span></h1>
        </div>

        <div className="bg-white shadow-2xl rounded-2xl border border-slate-100 overflow-hidden">
          <div className="p-8 border-b border-slate-50">
            <span className="text-slate-400 text-xs font-bold uppercase tracking-widest">Pay Direct Cheers</span>
            <div className="flex justify-between items-end mt-2">
              <h2 className="text-3xl font-bold">¥500</h2>
              <span className="text-slate-400 text-sm mb-1">Cheers! Digital Card #039</span>
            </div>
          </div>

          <div className="p-8 space-y-6">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase block mb-2">Email</label>
              <input type="text" className="w-full border-b border-slate-200 py-2 focus:border-blue-500 outline-none transition-colors" placeholder="demo@example.com" />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 uppercase block mb-2">Card Information</label>
              <div className="relative">
                <input type="text" className="w-full border-b border-slate-200 py-2 focus:border-blue-500 outline-none transition-colors" placeholder="4242 4242 4242 4242" />
                <CreditCard className="absolute right-0 top-2 text-slate-300" size={20} />
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <input type="text" className="border-b border-slate-200 py-2 focus:border-blue-500 outline-none transition-colors" placeholder="MM / YY" />
                <input type="text" className="border-b border-slate-200 py-2 focus:border-blue-500 outline-none transition-colors" placeholder="CVC" />
              </div>
            </div>

            <Link 
              href="/demo/thanks" 
              className="w-full bg-[#635bff] text-white h-12 rounded-md font-bold flex items-center justify-center gap-2 hover:bg-[#5851e0] transition-colors shadow-lg shadow-indigo-200"
            >
              Pay ¥500
            </Link>

            <div className="flex items-center justify-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
              <Lock size={12} /> Powered by Stripe | Secure Payment
            </div>
          </div>
        </div>
        
        <div className="mt-8 text-center">
          <Link href="/demo" className="text-slate-400 text-xs hover:text-slate-600 transition-colors">キャンセルして戻る</Link>
        </div>
      </div>
    </div>
  );
}