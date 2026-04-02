'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Wallet, ArrowRight, Sparkles, X, Smartphone, Info, Fingerprint, AlertTriangle } from "lucide-react";

function ThanksContent() {
  const searchParams = useSearchParams();
  const [showModal, setShowModal] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  
  // 状態管理
  const [userEmail, setUserEmail] = useState("Checking...");
  const [debugLog, setDebugLog] = useState("Initializing...");

  useEffect(() => {
    // 1. URLからセッションIDを取得
    const sessionId = searchParams.get('session_id');
    const rawEmail = searchParams.get('email');

    if (!sessionId || sessionId === '{CHECKOUT_SESSION_ID}') {
      setDebugLog("Error: session_id is missing or not replaced by Stripe.");
      setUserEmail("No Session Found");
      return;
    }

    setDebugLog(`Fetching data for session: ${sessionId.substring(0, 12)}...`);

    // 2. 自作APIに問い合わせて「本物のメアド」を取得
    const getRealData = async () => {
      try {
        const response = await fetch(`/api/get-session?session_id=${sessionId}`);
        
        if (!response.ok) {
          const errText = await response.text();
          setDebugLog(`API Error (${response.status}): ${errText}`);
          setUserEmail("Fetch Failed");
          return;
        }

        const data = await response.json();
        
        if (data.email) {
          setUserEmail(data.email);
          setDebugLog("Successfully retrieved from Stripe!");
        } else {
          setUserEmail("Email Not Linked");
          setDebugLog("Session found, but customer_details.email is empty.");
        }
      } catch (err: any) {
        setDebugLog(`Network/Runtime Error: ${err.message}`);
        setUserEmail("Connection Error");
      }
    };

    getRealData();
  }, [searchParams]);

  const handlePasskeyRegister = async () => {
    console.log("Registering Passkey for:", userEmail);
    setTimeout(() => setIsRegistered(true), 800);
  };

  return (
    <main className="max-w-4xl mx-auto pt-20 pb-32 px-6 relative z-10 text-center">
      <div className="mb-12 flex flex-col items-center">
        <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center border border-green-500/50 mb-6 animate-pulse">
          <CheckCircle2 className="text-green-400" size={40} />
        </div>
        <span className="text-pink-500 font-black italic tracking-[0.4em] text-xs uppercase mb-4">Payment Completed</span>
        <h1 className="text-4xl md:text-6xl font-black text-white tracking-tighter italic uppercase leading-[1.1]">
          Cheers! <br />
          <span className="bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent">Access Granted.</span>
        </h1>

        {/* 📧 メアド表示 & デバッグログ */}
        <div className="mt-8 p-1 bg-gradient-to-b from-white/10 to-transparent rounded-[2rem] w-full max-w-sm">
          <div className="bg-slate-900/90 backdrop-blur-xl rounded-[1.9rem] p-6 border border-white/5 shadow-2xl">
            <div className="flex flex-col items-center gap-2">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Registered ID</span>
              <span className="text-xl font-mono text-pink-400 break-all select-all">
                {userEmail === "Checking..." ? (
                  <span className="animate-pulse italic opacity-50">Checking Stripe...</span>
                ) : userEmail}
              </span>
            </div>
            
            {/* ⚡️ デバッグログ表示エリア */}
            <div className="mt-4 pt-4 border-t border-white/5 flex items-start gap-2 text-left">
              <AlertTriangle size={12} className="text-amber-500 mt-0.5 shrink-0" />
              <p className="text-[9px] font-mono text-slate-400 leading-tight italic">
                <span className="text-amber-500 font-bold uppercase mr-1">System Log:</span>
                {debugLog}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid gap-4 max-w-sm mx-auto">
        {!isRegistered ? (
          <button 
            onClick={handlePasskeyRegister}
            className="flex items-center justify-center gap-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white h-16 rounded-2xl font-black text-lg hover:from-pink-500 hover:to-orange-500 transition-all shadow-[0_0_20px_rgba(168,85,247,0.4)] group active:scale-95"
          >
            <Fingerprint size={24} className="animate-pulse" /> 
            顔パス（生体認証）を有効化
            <ArrowRight className="opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" size={20} />
          </button>
        ) : (
          <div className="bg-green-500/10 border border-green-500/30 h-16 rounded-2xl flex items-center justify-center gap-3 text-green-400 font-black text-lg">
            <CheckCircle2 size={24} /> 生体認証 登録済み
          </div>
        )}

        <button 
          onClick={() => setShowModal(true)}
          className="flex items-center justify-center gap-3 bg-white text-slate-950 h-16 rounded-2xl font-black text-lg hover:bg-slate-200 transition-all shadow-xl group active:scale-95"
        >
          <Wallet size={20} fill="currentColor" /> Add to Wallet
        </button>

        <Link href="/demo" className="text-slate-500 hover:text-pink-500 transition-colors text-[10px] font-bold uppercase tracking-widest mt-8 flex items-center justify-center gap-2">
          <ArrowRight size={12} className="rotate-180" /> Back to Artist Page
        </Link>
      </div>

      {/* Modal はそのまま維持 */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-[2.5rem] p-8 relative shadow-2xl">
            <button onClick={() => setShowModal(false)} className="absolute top-6 right-6 text-slate-500 hover:text-white"><X size={24} /></button>
            <h2 className="text-xl font-black text-white italic uppercase mb-4">Apple Wallet</h2>
            <p className="text-sm text-slate-400 leading-relaxed mb-8">
              本番では、決済完了と同時にパスファイル(.pkpass)を生成。Apple Payのメアドがこのカードの所有者として刻印されます。
            </p>
            <button onClick={() => setShowModal(false)} className="w-full bg-slate-200 text-slate-950 h-14 rounded-2xl font-black uppercase text-xs">Close</button>
          </div>
        </div>
      )}
    </main>
  );
}

export default function ThanksPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-pink-500/30 overflow-x-hidden">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-pink-500/10 blur-[120px] rounded-full" />
      </div>
      <Suspense fallback={<div className="pt-40 text-center font-black text-slate-500 tracking-[0.5em]">LOADING...</div>}>
        <ThanksContent />
      </Suspense>
    </div>
  );
}