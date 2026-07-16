"use client";

import { useRef, useState, useTransition } from "react";
import { Link2, Copy, Check, Loader2, ArrowRight, Search, UserCircle, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { roleRank } from "@/lib/role-rank";
import type { InvitationRow } from "@/components/invitations-list";

const ROLE_OPTIONS: Record<string, { label: string; canInvite: string[] }> = {
  admin: {
    label: "管理者",
    canInvite: ["agent"],
  },
  agent: {
    label: "エージェント",
    // アーティスト招待が大半のため先頭＝デフォルトにする（オーガナイザー誤発行はランクダウン不能）
    canInvite: ["artist", "organizer"],
  },
  organizer: {
    label: "オーガナイザー",
    canInvite: ["artist"],
  },
};

const ROLE_LABELS: Record<string, string> = {
  user: "ユーザー",
  agent: "エージェント",
  organizer: "オーガナイザー",
  artist: "アーティスト / DJ",
  admin: "管理者",
};

export type UserSearchResult = {
  profile_id: string;
  display_name: string;
  artist_name: string | null;
  organizer_name: string | null;
  avatar_url: string | null;
  role: string;
};

function subNames(u: UserSearchResult): string {
  const names = [u.artist_name, u.organizer_name].filter(
    (n): n is string => !!n && n !== u.display_name,
  );
  return names.join(" / ");
}

export function InviteCreateForm({ myRole, onAdd }: { myRole: string; onAdd?: (inv: InvitationRow) => void }) {
  const options = ROLE_OPTIONS[myRole];
  const [targetRole, setTargetRole] = useState(options?.canInvite[0] ?? "");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!options) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-8 text-center">
        <p className="text-slate-500 text-sm font-bold">招待を発行する権限がありません。</p>
      </div>
    );
  }

  // 選択中ユーザーが既に同等以上のランクを持つロールへは招待できない
  const isRoleInvitable = (role: string) =>
    !selectedUser || roleRank(role) > roleRank(selectedUser.role);
  const canSubmit = !!selectedUser && isRoleInvitable(targetRole);

  const handleQueryChange = (q: string) => {
    setQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/invitations/search-users?q=${encodeURIComponent(q.trim())}`);
        const data = await res.json();
        setSearchResults(data.users ?? []);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  };

  const handleSelect = (u: UserSearchResult) => {
    setSelectedUser(u);
    setQuery("");
    setSearchResults([]);
    // 選択したロールが無効になる場合、招待可能な先頭ロールに切り替える
    if (roleRank(targetRole) <= roleRank(u.role)) {
      const firstValid = options.canInvite.find((r) => roleRank(r) > roleRank(u.role));
      if (firstValid) setTargetRole(firstValid);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setError(null);
    setGeneratedLink(null);
    startTransition(async () => {
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_role: targetRole,
          target_profile_id: selectedUser.profile_id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "エラーが発生しました");
        return;
      }
      const url = `${window.location.origin}/invite/${data.token}`;
      setGeneratedLink(url);
      setEmailSent(Boolean(data.is_sent));
      setSelectedUser(null);
      onAdd?.(data as InvitationRow);
    });
  };

  const handleCopy = async () => {
    if (!generatedLink) return;
    await navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit}>
        <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-8 space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
              招待する相手
            </label>
            {selectedUser ? (
              <div className="flex items-center gap-3 bg-slate-950/50 border border-pink-500/30 rounded-2xl px-5 py-4">
                {selectedUser.avatar_url ? (
                  <img
                    src={selectedUser.avatar_url}
                    alt=""
                    className="w-10 h-10 rounded-xl object-cover shrink-0"
                  />
                ) : (
                  <UserCircle size={40} className="text-slate-600 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-white truncate">{selectedUser.display_name}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {subNames(selectedUser) && <span className="mr-2">{subNames(selectedUser)}</span>}
                    現在: {ROLE_LABELS[selectedUser.role] ?? selectedUser.role}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedUser(null)}
                  className="shrink-0 w-8 h-8 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl flex items-center justify-center text-slate-400 hover:text-white transition-all"
                  aria-label="選択を解除"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="relative">
                <div className="relative">
                  <Search
                    size={16}
                    className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none"
                  />
                  <Input
                    type="text"
                    value={query}
                    onChange={(e) => handleQueryChange(e.target.value)}
                    placeholder="名前・アーティスト名・オーガナイザー名で検索"
                    className="h-14 bg-slate-950/50 border-slate-700 rounded-2xl pl-12 pr-5 text-sm text-white placeholder:text-slate-600 focus:border-pink-500 focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                  {isSearching && (
                    <Loader2
                      size={16}
                      className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-500 animate-spin"
                    />
                  )}
                </div>
                {query.trim() && !isSearching && (
                  <div className="absolute z-10 mt-2 w-full bg-slate-950 border border-slate-700 rounded-2xl overflow-hidden shadow-xl max-h-72 overflow-y-auto">
                    {searchResults.length === 0 ? (
                      <p className="px-5 py-4 text-xs text-slate-500 font-bold">
                        該当するユーザーが見つかりません
                      </p>
                    ) : (
                      searchResults.map((u) => (
                        <button
                          key={u.profile_id}
                          type="button"
                          onClick={() => handleSelect(u)}
                          className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-800 transition-colors text-left"
                        >
                          {u.avatar_url ? (
                            <img src={u.avatar_url} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                          ) : (
                            <UserCircle size={32} className="text-slate-600 shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-white truncate">{u.display_name}</p>
                            <p className="text-xs text-slate-500 truncate">
                              {subNames(u) && <span className="mr-2">{subNames(u)}</span>}
                              {ROLE_LABELS[u.role] ?? u.role}
                            </p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
                <p className="mt-2 text-[10px] text-slate-600 leading-relaxed">
                  登録済みユーザーの中から招待する相手を選んでください
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
              招待するロール
            </label>
            <div className="flex flex-wrap gap-2">
              {options.canInvite.map((role) => {
                const invitable = isRoleInvitable(role);
                return (
                  <button
                    key={role}
                    type="button"
                    disabled={!invitable}
                    onClick={() => setTargetRole(role)}
                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                      !invitable
                        ? "bg-slate-800/50 text-slate-600 border border-slate-800 cursor-not-allowed"
                        : targetRole === role
                          ? "bg-pink-500 text-white shadow-[0_0_20px_rgba(236,72,153,0.3)]"
                          : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white border border-slate-700"
                    }`}
                  >
                    {ROLE_LABELS[role]}
                  </button>
                );
              })}
            </div>
            {selectedUser && !canSubmit && (
              <p className="text-[10px] text-yellow-500 leading-relaxed font-bold">
                {selectedUser.display_name}さんは既に同等以上のロールを持っているため、この招待は発行できません
              </p>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-400 font-bold">{error}</p>
          )}

          <button
            type="submit"
            disabled={isPending || !canSubmit}
            className="w-full h-14 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] hover:brightness-110 transition-all shadow-[0_0_30px_rgba(236,72,153,0.3)] active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isPending ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <>招待を送信 <ArrowRight size={18} /></>
            )}
          </button>
        </div>
      </form>

      {generatedLink && (
        <div className="bg-slate-900 border border-pink-500/30 rounded-[2rem] p-8 space-y-4">
          <div className="flex items-center gap-2">
            <Link2 size={16} className="text-pink-500" />
            <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.3em]">
              {emailSent ? "招待メールを送信しました" : "招待リンクが発行されました"}
            </p>
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 flex items-center justify-between gap-4">
            <p className="text-xs text-slate-400 font-mono truncate">{generatedLink}</p>
            <button
              onClick={handleCopy}
              className="shrink-0 w-10 h-10 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl flex items-center justify-center transition-all"
            >
              {copied ? (
                <Check size={16} className="text-emerald-400" />
              ) : (
                <Copy size={16} className="text-slate-400" />
              )}
            </button>
          </div>
          <p className="text-[10px] text-slate-600">
            {emailSent
              ? "メールが届かない場合は、このリンクを直接相手に送ってください。有効期限は30日間です。"
              : "メールを自動送信できませんでした。このリンクを相手に送ってください。有効期限は30日間です。"}
          </p>
        </div>
      )}
    </div>
  );
}
