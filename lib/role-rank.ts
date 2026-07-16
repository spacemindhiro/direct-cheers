// ロールは上位互換（admin ⊇ agent ⊇ organizer ⊇ artist ⊇ user）。
// accept_invitation RPC の v_rank_of と同じ序列を保つこと。
export const ROLE_RANK: Record<string, number> = {
  user: 0,
  artist: 1,
  organizer: 2,
  agent: 3,
  admin: 4,
};

export function roleRank(role: string | null | undefined): number {
  return ROLE_RANK[role ?? ""] ?? 0;
}
