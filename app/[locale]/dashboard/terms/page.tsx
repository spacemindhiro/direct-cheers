'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle2, ScrollText, ChevronDown } from 'lucide-react';
import {
  TERMS_CONTENT,
  TERMS_LABELS,
  getRequiredTermsTypes,
  type TermsType,
} from '@/lib/terms';

type StatusData = {
  role: string;
  status: Record<TermsType, { required: boolean; agreed: boolean; version: string }>;
  allAgreed: boolean;
};

function TermsArticle({ section }: { section: import('@/lib/terms').TermsSection }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-black text-indigo-400 uppercase tracking-widest">{section.article}</p>
      <p className="text-sm font-black text-white">{section.title}</p>
      <div className="space-y-2 text-[13px] text-slate-400 leading-relaxed">
        {section.paragraphs.map((p, i) => (
          <p key={i}>{typeof p === 'string' ? p : p.join('')}</p>
        ))}
      </div>
    </div>
  );
}

function TermsBlock({ type, label, sections }: { type: TermsType; label: string; sections: import('@/lib/terms').TermsSection[] }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-[2rem] overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-800 bg-slate-900">
        <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em]">
          {type === 'base' ? 'General' : type === 'organizer' ? 'Organizer' : 'Agent'} Terms
        </p>
        <p className="text-sm font-black text-white mt-0.5">{label}</p>
      </div>
      <div className="px-6 py-5 space-y-6">
        {sections.map((s) => (
          <TermsArticle key={s.article} section={s} />
        ))}
      </div>
    </div>
  );
}

function TermsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextUrl = searchParams.get('next') ?? '/dashboard/profile/bank-setup';

  const [statusData, setStatusData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [agreeing, setAgreeing] = useState(false);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/terms/status')
      .then((r) => r.json())
      .then((data: StatusData) => {
        setStatusData(data);
        if (data.allAgreed) router.replace(nextUrl);
      })
      .finally(() => setLoading(false));
  }, [nextUrl, router]);

  useEffect(() => {
    if (!bottomRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setScrolledToBottom(true); },
      { threshold: 0.5 }
    );
    observer.observe(bottomRef.current);
    return () => observer.disconnect();
  }, [statusData]);

  const handleAgree = async () => {
    if (!statusData || agreeing) return;
    setAgreeing(true);
    try {
      const required = getRequiredTermsTypes(statusData.role);
      const pending = required.filter((t) => !statusData.status[t].agreed);
      const res = await fetch('/api/terms/agree', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ types: pending }),
      });
      if (res.ok) {
        router.push(nextUrl);
      }
    } finally {
      setAgreeing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-slate-600" size={28} />
      </div>
    );
  }

  if (!statusData) return null;

  const required = getRequiredTermsTypes(statusData.role);
  const pendingTypes = required.filter((t) => !statusData.status[t].agreed);

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20">
      <div className="space-y-1">
        <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">Terms</p>
        <h1 className="text-3xl font-black text-white italic uppercase tracking-tighter">利用規約への同意</h1>
        <p className="text-sm text-slate-500">
          口座登録の前に、以下の規約をよくお読みください。
        </p>
      </div>

      {/* 既同意済みの表示 */}
      {required.filter((t) => statusData.status[t].agreed).map((t) => (
        <div key={t} className="flex items-center gap-3 px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          <div>
            <p className="text-xs font-black text-emerald-400">{TERMS_LABELS[t]}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">同意済み（{statusData.status[t].version}）</p>
          </div>
        </div>
      ))}

      {/* 未同意の規約を表示 */}
      {pendingTypes.length > 0 && (
        <>
          <div className="flex items-center gap-2 text-slate-500">
            <ScrollText size={14} />
            <p className="text-xs font-bold">以下の規約にご同意ください</p>
            <ChevronDown size={14} className="animate-bounce" />
          </div>

          <div className="space-y-6">
            {pendingTypes.map((t) => (
              <TermsBlock
                key={t}
                type={t}
                label={TERMS_LABELS[t]}
                sections={TERMS_CONTENT[t]}
              />
            ))}
          </div>

          <div ref={bottomRef} className="h-1" />

          {!scrolledToBottom && (
            <p className="text-center text-[11px] text-slate-600 font-bold">
              最後までスクロールすると同意ボタンが有効になります
            </p>
          )}

          <button
            type="button"
            onClick={handleAgree}
            disabled={!scrolledToBottom || agreeing}
            className="w-full h-14 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:brightness-110 text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {agreeing ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <>
                <CheckCircle2 size={16} />
                上記の規約すべてに同意して続ける
              </>
            )}
          </button>

          <p className="text-center text-[10px] text-slate-600 leading-relaxed">
            同意ボタンを押すことで、上記規約の全条項に法的拘束力を持つ形で同意したものとみなされます。
          </p>
        </>
      )}
    </div>
  );
}

export default function TermsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-slate-600" size={28} />
      </div>
    }>
      <TermsContent />
    </Suspense>
  );
}
