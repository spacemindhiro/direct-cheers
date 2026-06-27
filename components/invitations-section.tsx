"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import { InviteCreateForm } from "@/components/invite-create-form";
import { InvitationsList, type InvitationRow } from "@/components/invitations-list";

export function InvitationsSection({
  myRole,
  initialInvitations,
  origin,
}: {
  myRole: string;
  initialInvitations: InvitationRow[];
  origin: string;
}) {
  const [invitations, setInvitations] = useState(initialInvitations);

  const handleAdd = (inv: InvitationRow) => {
    setInvitations((prev) => [inv, ...prev]);
  };

  const handleDelete = (id: string) => {
    setInvitations((prev) => prev.filter((i) => i.invitation_id !== id));
  };

  return (
    <>
      <InviteCreateForm myRole={myRole} onAdd={handleAdd} />

      <div className="space-y-4">
        <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2">
          <Users size={14} className="text-pink-500" /> 発行済み招待
        </h2>
        <InvitationsList
          invitations={invitations}
          origin={origin}
          onDelete={handleDelete}
        />
      </div>
    </>
  );
}
