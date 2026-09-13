'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle2, ScrollText, ChevronDown, Clock, ShieldCheck, Sparkles, ChevronRight } from 'lucide-react';
import {
  TERMS_CONTENT,
  TERMS_LABELS,
  getRequiredTermsTypes,
  getTermsSections,
  type TermsType,
  type TermsSection,
} from '@/lib/terms';

type TermsStatusItem = {
  required: boolean;
  digitallySigned: boolean;
  confirmed: boolean;
  agreed: boolean;
  needsConfirmation: boolean;
  version: string;
  previousVersion: string | null;
};

type StatusData = {
  role: string;
  status: Record<TermsType, TermsStatusItem>;
  allAgreed: boolean;
  hasAnyPastAgreement: boolean;
};

function TermsArticle({ section, diffState }: { section: TermsSection; diffState?: 'new' | 'changed' }) {
  return (
    <div className={`space-y-2 ${diffState ? 'rounded-2xl border p-4 -mx-1' : ''} ${
      diffState === 'new' ? 'border-pink-500/40 bg-pink-500/5' : diffState === 'changed' ? 'border-amber-500/40 bg-amber-500/5' : ''
    }`}>
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-xs font-black text-indigo-400 uppercase tracking-widest">{section.article}</p>
        {diffState === 'new' && (
          <span className="flex items-center gap-1 text-[10px] font-black text-pink-400 bg-pink-500/10 border border-pink-500/30 rounded-full px-2 py-0.5">
            <Sparkles size={10} /> 新設
          </span>
        )}
        {diffState === 'changed' && (
          <span className="text-[10px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-full px-2 py-0.5">
            変更あり
          </span>
        )}
      </div>
      <p className="text-sm font-black text-white">{section.title}</p>
      <div className="space-y-2 text-[13px] text-slate-400 leading-relaxed">
        {section.paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </div>
  );
}

function TermsBlock({ type, label, sections, previousVersion }: { type: TermsType; label: string; sections: TermsSection[]; previousVersion: string | null }) {
  const [showUnchanged, setShowUnchanged] = useState(!previousVersion);

  const oldSections = previousVersion ? getTermsSections(type, previousVersion) : null;
  const oldByArticle = new Map((oldSections ?? []).map((s) => [s.article, s]));

  const diffOf = (s: TermsSection): 'new' | 'changed' | undefined => {
    if (!oldSections) return undefined;
    const old = oldByArticle.get(s.article);
    if (!old) return 'new';
    if (JSON.stringify(old.paragraphs) !== JSON.stringify(s.paragraphs) || old.title !== s.title) return 'changed';
    return undefined;
  };

  const changedSections = sections.filter((s) => diffOf(s));
  const unchangedSections = sections.filter((s) => !diffOf(s));
  const hasDiff = oldSections && changedSections.length > 0;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-[2rem] overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-800">
        <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em]">
          {type === 'base' ? 'General' : type === 'organizer' ? 'Organizer' : 'Agent'} Terms
        </p>
        <p className="text-sm font-black text-white mt-0.5">{label}</p>
        {hasDiff && (
          <p className="text-[10px] text-slate-500 mt-1">
            前回同意版（{previousVersion}）からの変更点のみ強調表示しています
          </p>
        )}
      </div>
      <div className="px-6 py-5 space-y-6">
        {hasDiff ? (
          <>
            {changedSections.map((s) => (
              <TermsArticle key={s.article} section={s} diffState={diffOf(s)} />
            ))}
            {unchangedSections.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowUnchanged((v) => !v)}
                  className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <ChevronRight size={12} className={`transition-transform ${showUnchanged ? 'rotate-90' : ''}`} />
                  変更のない条項を{showUnchanged ? '隠す' : `表示する（${unchangedSections.length}件）`}
                </button>
                {showUnchanged && (
                  <div className="space-y-6 mt-4">
                    {unchangedSections.map((s) => (
                      <TermsArticle key={s.article} section={s} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          sections.map((s) => (
            <TermsArticle key={s.article} section={s} diffState={diffOf(s)} />
          ))
        )}
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

  const reload = () => {
    setLoading(true);
    fetch('/api/terms/status')
      .then((r) => r.json())
      .then((data: StatusData) => {
        setStatusData(data);
        if (data.allAgreed) router.replace(nextUrl);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, []);

  useEffect(() => {
    if (!bottomRef.current || !statusData) return;
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
      // デジタル同意がまだの型のみ送る
      const pending = required.filter((t) => !statusData.status[t].digitallySigned);
      if (pending.length === 0) return;
      const res = await fetch('/api/terms/agree', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ types: pending }),
      });
      if (res.ok) reload();
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

  // 完了済み
  const doneTypes    = required.filter((t) => statusData.status[t].agreed);
  // デジタル同意済みだがadmin未確認（面談待ち）
  const waitingTypes = required.filter((t) => statusData.status[t].digitallySigned && !statusData.status[t].agreed);
  // まだデジタル同意もしていない
  const pendingTypes = required.filter((t) => !statusData.status[t].digitallySigned);

  const hasAnythingToSign = pendingTypes.length > 0;
  // 既存ユーザーの再同意か、新規の初回同意か（ボタン文言・案内文の出し分けに使う）
  const isReconsent = statusData.hasAnyPastAgreement;

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20">
      <div className="space-y-1">
        <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">Terms</p>
        <h1 className="text-3xl font-black text-white italic uppercase tracking-tighter">
          {isReconsent ? '利用規約が更新されました' : '利用規約への同意'}
        </h1>
        <p className="text-sm text-slate-500">本サービスのご利用には、以下の規約への同意が必要です。必ずお読みください。</p>
      </div>

      {isReconsent && (
        <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-5 space-y-2">
          <p className="text-xs font-black text-indigo-300">なぜこの画面が出ているのですか？</p>
          <p className="text-xs text-slate-400 leading-relaxed">
            アカウントや権限に問題が起きたわけではありません。サービス内容の変更に伴い規約を改定したため、
            すでにご利用中の方にも改めて同意をお願いしています。この画面は規約改定のたびにのみ表示される、
            頻繁には起きないものです。変更箇所には目印を付けていますので、そこだけでもご確認ください。
            同意いただくまでの間、既存のご利用には影響ありません。
          </p>
        </div>
      )}

      {/* 完了済み */}
      {doneTypes.map((t) => (
        <div key={t} className="flex items-center gap-3 px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          <div>
            <p className="text-xs font-black text-emerald-400">{TERMS_LABELS[t]}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">同意完了（{statusData.status[t].version}）</p>
          </div>
        </div>
      ))}

      {/* 面談待ち（デジタル同意済み・admin未確認） */}
      {waitingTypes.map((t) => (
        <div key={t} className="flex items-center gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
          <Clock size={16} className="text-amber-400 shrink-0" />
          <div className="flex-1">
            <p className="text-xs font-black text-amber-400">{TERMS_LABELS[t]}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">デジタル同意済み — オーナーとの対面面談・承認待ち</p>
          </div>
          <ShieldCheck size={14} className="text-amber-500/50 shrink-0" />
        </div>
      ))}

      {/* 未同意の規約 */}
      {hasAnythingToSign && (
        <>
          <div className="flex items-center gap-2 text-slate-500">
            <ScrollText size={14} />
            <p className="text-xs font-bold">以下の規約をお読みください</p>
            <ChevronDown size={14} className="animate-bounce" />
          </div>

          <div className="space-y-6">
            {pendingTypes.map((t) => (
              <TermsBlock
                key={t}
                type={t}
                label={TERMS_LABELS[t]}
                sections={TERMS_CONTENT[t]}
                previousVersion={statusData.status[t].previousVersion}
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
                {isReconsent ? '同意して次へ進む' : '同意して口座登録へ進む'}
              </>
            )}
          </button>

          <p className="text-center text-[10px] text-slate-600 leading-relaxed">
            同意ボタンを押すことで、上記規約の全条項に法的拘束力を持つ形で同意したものとみなされます。
          </p>
        </>
      )}

      {/* 面談待ちのみで未同意なしの場合 */}
      {!hasAnythingToSign && waitingTypes.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6 space-y-3 text-center">
          <div className="w-12 h-12 mx-auto bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center">
            <Clock size={20} className="text-amber-400" />
          </div>
          <p className="text-sm font-black text-white">オーナーとの対面面談をお待ちください</p>
          <p className="text-xs text-slate-500 leading-relaxed">
            デジタル同意は完了しています。<br />
            オーガナイザー・エージェント権限の有効化には、オーナーとの対面面談および承認が必要です。<br />
            面談日程についてはエージェントまでお問い合わせください。
          </p>
        </div>
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
