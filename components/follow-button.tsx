"use client";

import { useState, useEffect, useCallback } from "react";
import { Heart, HeartHandshake, Loader2, X } from "lucide-react";

type Props = {
  followeeId: string;
  followeeName: string;
  followeeRole?: string;
  size?: "sm" | "md" | "lg";
  onFollowChange?: (followed: boolean) => void;
};

export function FollowButton({
  followeeId,
  followeeName,
  followeeRole,
  size = "md",
  onFollowChange,
}: Props) {
  const [isFollowing, setIsFollowing] = useState<boolean | null>(null);
  const [followerCount, setFollowerCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; sub: string } | null>(null);
  const [showUnfollowConfirm, setShowUnfollowConfirm] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/follows/${followeeId}`);
      if (res.ok) {
        const data = await res.json();
        setIsFollowing(data.is_following);
        setFollowerCount(data.follower_count);
      }
    } catch {
      // ゲストはフォロー状態 null のまま
    }
  }, [followeeId]);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async () => {
    if (loading) return;

    if (isFollowing) {
      setShowUnfollowConfirm(true);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/follows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ followee_id: followeeId }),
      });
      const data = await res.json();

      if (res.status === 401) {
        // 未ログインの場合は何もしない（将来：ログイン誘導）
        return;
      }

      if (data.error) return;

      const nowFollowing: boolean = data.followed;
      setIsFollowing(nowFollowing);
      if (data.new_follower_count !== undefined) {
        setFollowerCount(data.new_follower_count);
      } else {
        setFollowerCount((prev) => prev + (nowFollowing ? 1 : -1));
      }
      onFollowChange?.(nowFollowing);

      if (nowFollowing) {
        // フォロー成功ポップアップ
        const roleLabel = followeeRole === "organizer" ? "オーガナイザー" : "アーティスト";
        setToast({
          message: `${followeeName} をフォローしました！`,
          sub: `${roleLabel}の新しい活動をお知らせします`,
        });
        setTimeout(() => setToast(null), 4000);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUnfollow = async () => {
    setShowUnfollowConfirm(false);
    setLoading(true);
    try {
      const res = await fetch("/api/follows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ followee_id: followeeId }),
      });
      const data = await res.json();
      if (!data.error) {
        setIsFollowing(false);
        setFollowerCount((prev) => Math.max(0, prev - 1));
        onFollowChange?.(false);
      }
    } finally {
      setLoading(false);
    }
  };

  const sizeClasses = {
    sm: "h-9 px-4 text-[11px] gap-1.5",
    md: "h-11 px-5 text-xs gap-2",
    lg: "h-14 px-7 text-sm gap-2.5",
  };

  const iconSize = { sm: 13, md: 15, lg: 18 }[size];

  return (
    <div className="relative">
      {/* フォローボタン */}
      <button
        type="button"
        onClick={handleToggle}
        disabled={loading}
        className={`
          flex items-center justify-center font-black uppercase tracking-widest rounded-2xl transition-all active:scale-[0.97] disabled:opacity-60
          ${sizeClasses[size]}
          ${isFollowing
            ? "bg-slate-800 border border-slate-700 text-slate-300 hover:border-red-500/40 hover:text-red-400"
            : "bg-gradient-to-r from-pink-600 to-pink-500 text-white shadow-[0_0_20px_rgba(236,72,153,0.25)] hover:brightness-110"
          }
        `}
      >
        {loading ? (
          <Loader2 size={iconSize} className="animate-spin" />
        ) : isFollowing ? (
          <>
            <HeartHandshake size={iconSize} />
            フォロー中
          </>
        ) : (
          <>
            <Heart size={iconSize} />
            フォローする
          </>
        )}
      </button>

      {/* フォロワー数（sm 以外で表示） */}
      {size !== "sm" && followerCount > 0 && (
        <p className="text-center text-[10px] text-slate-600 mt-1.5">
          {followerCount.toLocaleString()} フォロワー
        </p>
      )}

      {/* アンフォロー確認 */}
      {showUnfollowConfirm && (
        <div className="absolute top-full left-0 mt-2 z-50 bg-slate-900 border border-slate-700 rounded-2xl p-4 w-56 space-y-3 shadow-xl">
          <p className="text-xs font-bold text-white">
            {followeeName} のフォローを解除しますか？
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleUnfollow}
              className="flex-1 h-9 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-xs font-black hover:bg-red-500/20 transition-colors"
            >
              解除
            </button>
            <button
              onClick={() => setShowUnfollowConfirm(false)}
              className="flex-1 h-9 bg-slate-800 text-slate-400 rounded-xl text-xs font-black hover:bg-slate-700 transition-colors"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* フォロー成功トースト（アーティストからのメッセージ風） */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-300"
          style={{ width: "min(360px, calc(100vw - 32px))" }}
        >
          <div className="bg-slate-900 border border-pink-500/30 rounded-2xl p-4 shadow-[0_0_40px_rgba(236,72,153,0.2)]">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-pink-600 to-pink-800 flex items-center justify-center shrink-0">
                  <Heart size={16} className="fill-white text-white" />
                </div>
                <div>
                  <p className="text-sm font-black text-white leading-tight">
                    {toast.message}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {toast.sub}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setToast(null)}
                className="text-slate-600 hover:text-slate-400 transition-colors mt-0.5 shrink-0"
              >
                <X size={14} />
              </button>
            </div>
            {/* アーティストからのメッセージ */}
            <div className="mt-3 bg-pink-500/5 border border-pink-500/10 rounded-xl px-3 py-2">
              <p className="text-[11px] text-pink-300 italic leading-relaxed">
                "フォローありがとう！またライブで会いましょう 🎵"
              </p>
              <p className="text-[9px] text-slate-600 mt-1">— {followeeName}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
