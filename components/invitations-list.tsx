"use client";

import { useState, useTransition } from "react";
import {
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  Copy,
  Check,
  Trash2,
  Loader2,
} from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  agent: "エージェント",
  organizer: "オーガナイザー",
  artist: "アーティスト / DJ",
};

export type InvitationRow = {
  invitation_id: string;
  token: string;
  target_role: string;
  target_email: string | null;
  status: string;
  is_sent: boolean;
  viewed_at: string | null;
  expires_at: string;
  created_at: string;
  accepted_by: { display_name: string | null } | null;
};

function resolveStatus(inv: InvitationRow) {
  if (inv.status === "accepted") {
    return inv.accepted_by
      ? { label: "受諾済み・ログイン可", className: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", icon: <CheckCircle size={12} /> }
      : { label: "受諾済み", className: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", icon: <CheckCircle size={12} /> };
  }
  const isExpired = inv.status === "expired" || new Date(inv.expires_at) < new Date();
  if (isExpired) {
    return { label: "期限切れ", className: "text-slate-500 bg-slate-800 border-slate-700", icon: <XCircle size={12} /> };
  }
  if (inv.viewed_at) {
    return { label: "閲覧済み", className: "text-blue-400 bg-blue-500/10 border-blue-500/20", icon: <Eye size={12} /> };
  }
  return { label: "未開封", className: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20", icon: <Clock size={12} /> };
}

function InvitationItem({
  inv,
  origin,
  onDelete,
}: {
  inv: InvitationRow;
  origin: string;
  onDelete: (id: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [isSent, setIsSent] = useState(inv.is_sent);
  const [deleting, startDelete] = useTransition();
  const [patching, startPatch] = useTransition();

  const link = `${origin}/invite/${inv.token}`;
  const status = resolveStatus(inv);
  const isDone = inv.status === "accepted" || inv.status === "expired" || new Date(inv.expires_at) < new Date();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = () => {
    if (!confirm("この招待を削除しますか？")) return;
    startDelete(async () => {
      await fetch(`/api/invitations/${inv.token}`, { method: "DELETE" });
      onDelete(inv.invitation_id);
    });
  };

  const handleSentToggle = (checked: boolean) => {
    setIsSent(checked);
    startPatch(async () => {
      await fetch(`/api/invitations/${inv.token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_sent: checked }),
      });
    });
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-[1.5rem] px-6 py-4 space-y-3">
      {/* 上段: ロール・メアド・ステータス */}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-bold text-white">
            {ROLE_LABELS[inv.target_role] ?? inv.target_role}
          </p>
          <p className="text-xs text-slate-500 truncate">
            {inv.target_email ?? "メールなし"} ·{" "}
            {new Date(inv.created_at).toLocaleDateString("ja-JP")}
          </p>
        </div>
        <span
          className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border ${status.className}`}
        >
          {status.icon}
          {status.label}
        </span>
      </div>

      {/* 下段: リンク・操作 */}
      <div className="flex items-center gap-2">
        {/* リンクコピー */}
        {!isDone && (
          <button
            onClick={handleCopy}
            className="flex-1 h-9 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl flex items-center justify-center gap-1.5 text-[10px] font-black text-slate-400 hover:text-white transition-all"
          >
            {copied ? (
              <><Check size={12} className="text-emerald-400" /> コピー済み</>
            ) : (
              <><Copy size={12} /> リンクをコピー</>
            )}
          </button>
        )}

        {/* 送付済みチェック */}
        {!isDone && (
          <label className="flex items-center gap-1.5 px-3 h-9 bg-slate-800 border border-slate-700 rounded-xl cursor-pointer text-[10px] font-black text-slate-400 hover:text-white transition-all">
            <input
              type="checkbox"
              checked={isSent}
              onChange={(e) => handleSentToggle(e.target.checked)}
              disabled={patching}
              className="accent-pink-500 w-3.5 h-3.5"
            />
            送付済み
          </label>
        )}

        {/* 削除ボタン */}
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="w-9 h-9 bg-slate-800 hover:bg-red-500/10 border border-slate-700 hover:border-red-500/30 rounded-xl flex items-center justify-center transition-all text-slate-500 hover:text-red-400 shrink-0"
        >
          {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
        </button>
      </div>
    </div>
  );
}

export function InvitationsList({
  initialInvitations,
  origin,
}: {
  initialInvitations: InvitationRow[];
  origin: string;
}) {
  const [invitations, setInvitations] = useState(initialInvitations);

  const handleDelete = (id: string) => {
    setInvitations((prev) => prev.filter((i) => i.invitation_id !== id));
  };

  if (invitations.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-10 text-center">
        <p className="text-slate-600 text-sm font-bold italic uppercase tracking-wider">
          No invitations yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {invitations.map((inv) => (
        <InvitationItem
          key={inv.invitation_id}
          inv={inv}
          origin={origin}
          onDelete={handleDelete}
        />
      ))}
    </div>
  );
}
