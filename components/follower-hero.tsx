"use client";

import { useState, useEffect } from "react";
import { Users, TrendingUp, Sparkles, Star } from "lucide-react";

const MILESTONES = [10, 50, 100, 500, 1000, 5000, 10000];

function nextMilestone(count: number): number | null {
  return MILESTONES.find((m) => m > count) ?? null;
}

function progressToNext(count: number): number {
  const prev = [...MILESTONES].reverse().find((m) => m <= count) ?? 0;
  const next = nextMilestone(count);
  if (!next) return 100;
  return Math.round(((count - prev) / (next - prev)) * 100);
}

const MILESTONE_LABELS: Record<number, { label: string; color: string }> = {
  10:    { label: "Early Circle",  color: "text-slate-300" },
  50:    { label: "Rising",        color: "text-emerald-400" },
  100:   { label: "Established",   color: "text-blue-400" },
  500:   { label: "Influential",   color: "text-violet-400" },
  1000:  { label: "1K Club",       color: "text-amber-400" },
  5000:  { label: "5K Power",      color: "text-orange-400" },
  10000: { label: "10K Legend",    color: "text-pink-400" },
};

function currentTier(count: number) {
  const achieved = [...MILESTONES].reverse().find((m) => count >= m);
  return achieved ? MILESTONE_LABELS[achieved] : null;
}

type Props = {
  profileId: string;
  displayName: string;
  role: "artist" | "organizer";
};

export function FollowerHero({ profileId, displayName, role }: Props) {
  const [count, setCount] = useState<number | null>(null);
  const [milestone, setMilestone] = useState<number>(0);
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationTarget, setCelebrationTarget] = useState(0);

  useEffect(() => {
    fetch(`/api/follows/${profileId}`)
      .then((r) => r.json())
      .then((data) => {
        setCount(data.follower_count ?? 0);
      })
      .catch(() => setCount(0));

    // マイルストーン取得（自分のプロフィールから）
    fetch(`/api/profile/stats`)
      .then((r) => r.json())
      .then((data) => {
        if (data.follower_milestone !== undefined) {
          setMilestone(data.follower_milestone);
        }
      })
      .catch(() => {});
  }, [profileId]);

  // マイルストーン達成演出
  useEffect(() => {
    if (count === null) return;
    const justHit = MILESTONES.find((m) => count === m);
    if (justHit && justHit > milestone) {
      setCelebrationTarget(justHit);
      setShowCelebration(true);
      setTimeout(() => setShowCelebration(false), 6000);
    }
  }, [count, milestone]);

  if (count === null) {
    return <div className="h-48 bg-slate-900 border border-slate-800 rounded-[2rem] animate-pulse" />;
  }

  const next = nextMilestone(count);
  const progress = progressToNext(count);
  const tier = currentTier(count);
  const roleLabel = role === "artist" ? "アーティスト" : "オーガナイザー";

  return (
    <div className="relative">
      {/* お祝いオーバーレイ */}
      {showCelebration && (
        <div className="absolute inset-0 z-20 pointer-events-none overflow-hidden rounded-[2rem]">
          <div className="absolute inset-0 bg-gradient-to-br from-pink-500/20 to-amber-500/20 animate-pulse" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center space-y-2 bg-slate-950/90 border border-pink-500/40 rounded-2xl px-8 py-5 shadow-[0_0_60px_rgba(236,72,153,0.4)]">
              <p className="text-4xl">🎉</p>
              <p className="text-xl font-black text-white italic uppercase tracking-tighter">
                {celebrationTarget.toLocaleString()} フォロワー達成！
              </p>
              <p className="text-xs text-pink-400 font-bold">
                {MILESTONE_LABELS[celebrationTarget]?.label} ランクに到達しました
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-[2rem] overflow-hidden">
        {/* ヒーロー数字エリア */}
        <div className="relative px-8 pt-8 pb-6">
          {/* 背景グロー */}
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-pink-500/5 -translate-y-1/2 translate-x-1/4 blur-3xl pointer-events-none" />

          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Users size={14} className="text-pink-500" />
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">
                  Followers
                </p>
              </div>
              <p className="text-7xl sm:text-8xl font-black text-white italic tracking-tighter tabular-nums leading-none">
                {count.toLocaleString()}
              </p>
              {tier && (
                <div className="flex items-center gap-1.5 mt-3">
                  <Star size={11} className={tier.color} />
                  <p className={`text-[11px] font-black uppercase tracking-widest ${tier.color}`}>
                    {tier.label}
                  </p>
                </div>
              )}
            </div>

            {/* アイコン */}
            <div className="w-14 h-14 rounded-[1.5rem] bg-pink-500/10 border border-pink-500/20 flex items-center justify-center shrink-0">
              <TrendingUp size={24} className="text-pink-500" />
            </div>
          </div>
        </div>

        {/* 次のマイルストーンまでのプログレスバー */}
        {next && (
          <div className="px-8 pb-6 space-y-2">
            <div className="flex justify-between text-[10px]">
              <span className="text-slate-600 font-bold">次の目標：{next.toLocaleString()} フォロワー</span>
              <span className="text-slate-500 font-black tabular-nums">{progress}%</span>
            </div>
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-pink-600 to-pink-400 rounded-full transition-all duration-700"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-600">
              あと {(next - count).toLocaleString()} 人で{" "}
              <span className={`font-black ${MILESTONE_LABELS[next]?.color ?? "text-slate-400"}`}>
                {MILESTONE_LABELS[next]?.label}
              </span>
            </p>
          </div>
        )}

        {!next && (
          <div className="px-8 pb-6">
            <div className="flex items-center gap-2 bg-pink-500/10 border border-pink-500/20 rounded-2xl px-4 py-3">
              <Sparkles size={14} className="text-pink-400" />
              <p className="text-xs font-black text-pink-400">最高ランク達成！</p>
            </div>
          </div>
        )}

        {/* 区切りと統計 */}
        <div className="border-t border-slate-800 grid grid-cols-2">
          <div className="px-8 py-4 border-r border-slate-800">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">ロール</p>
            <p className="text-sm font-black text-white mt-1">{roleLabel}</p>
          </div>
          <div className="px-8 py-4">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">ランク</p>
            <p className={`text-sm font-black mt-1 ${tier?.color ?? "text-slate-500"}`}>
              {tier?.label ?? "—"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
