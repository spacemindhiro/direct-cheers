"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, ChevronDown, ChevronUp, Loader2, ArrowRight } from "lucide-react";
import { SignatureCanvas } from "@/components/signature-canvas";
import type { TermsSection } from "@/lib/terms-content";

type TermsGroup = { label: string; sections: TermsSection[] };

export function TermsAgreementForm({
  termsGroups,
  role,
}: {
  termsGroups: TermsGroup[];
  role: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);

  // 各セクションの開閉＆既読状態
  const allSections = termsGroups.flatMap((g) => g.sections);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    Object.fromEntries(allSections.map((s) => [s.id, false])),
  );
  const [readSections, setReadSections] = useState<Record<string, boolean>>(
    Object.fromEntries(allSections.map((s) => [s.id, false])),
  );

  const totalSections = allSections.length;
  const readCount = Object.values(readSections).filter(Boolean).length;
  const allRead = readCount === totalSections;

  const toggleSection = (id: string) => {
    setOpenSections((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      // 開いたら既読にする
      if (!prev[id]) {
        setReadSections((r) => ({ ...r, [id]: true }));
      }
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!allRead) {
      setError("全ての条項を開いて内容を確認してください");
      return;
    }
    if (!signature) {
      setError("署名が必要です");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/terms/agree", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature_data_url: signature }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "エラーが発生しました");
        return;
      }
      router.push("/dashboard");
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">

      {/* 進捗バー */}
      <div className="space-y-2">
        <div className="flex justify-between text-[10px] font-black text-slate-500 uppercase tracking-widest">
          <span>確認状況</span>
          <span className={allRead ? "text-emerald-400" : "text-yellow-400"}>
            {readCount} / {totalSections} 条項
          </span>
        </div>
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-pink-600 to-pink-400 rounded-full transition-all"
            style={{ width: `${(readCount / totalSections) * 100}%` }}
          />
        </div>
      </div>

      {/* 約款グループ */}
      {termsGroups.map((group) => (
        <div key={group.label} className="space-y-3">
          <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.3em]">
            {group.label}
          </p>
          <div className="space-y-2">
            {group.sections.map((section) => {
              const isOpen = openSections[section.id];
              const isRead = readSections[section.id];
              return (
                <div
                  key={section.id}
                  className={`bg-slate-900 border rounded-2xl overflow-hidden transition-colors ${
                    isRead ? "border-emerald-500/30" : "border-slate-800"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSection(section.id)}
                    className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                        isRead ? "border-emerald-500 bg-emerald-500/20" : "border-slate-600"
                      }`}>
                        {isRead && <CheckCircle size={12} className="text-emerald-400" />}
                      </div>
                      <span className="text-sm font-bold text-white truncate">{section.title}</span>
                    </div>
                    {isOpen ? (
                      <ChevronUp size={16} className="shrink-0 text-slate-400" />
                    ) : (
                      <ChevronDown size={16} className="shrink-0 text-slate-400" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 border-t border-slate-800">
                      <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line pt-4">
                        {section.body}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* 署名 */}
      <div className="space-y-3">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
          署名（Apple Pencil または指で署名してください）
        </p>
        <SignatureCanvas onSignature={setSignature} />
        {signature && (
          <p className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold">
            <CheckCircle size={14} /> 署名済み
          </p>
        )}
      </div>

      {/* 同意チェック */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <p className="text-xs text-slate-400 leading-relaxed">
          上記の全条項を確認し、内容に同意した上で署名しました。本約款への同意は取り消せません。
        </p>
      </div>

      {error && <p className="text-sm text-red-400 font-bold">{error}</p>}

      <button
        type="submit"
        disabled={isPending || !allRead || !signature}
        className="w-full h-16 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] hover:brightness-110 transition-all shadow-[0_0_30px_rgba(236,72,153,0.3)] active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isPending ? (
          <Loader2 size={20} className="animate-spin" />
        ) : (
          <>同意して続ける <ArrowRight size={18} /></>
        )}
      </button>

    </form>
  );
}
