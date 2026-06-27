import { createAdminClient } from "@/lib/supabase/admin";

export async function resolveProfileIdByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string | null,
): Promise<string | null> {
  if (!email) return null;
  const { data: prov } = await admin
    .from("provisional_users")
    .select("profile_id")
    .eq("email", email)
    .maybeSingle();
  if (prov?.profile_id) return prov.profile_id;
  try {
    const { data: { users } } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    return users.find((u) => u.email === email)?.id ?? null;
  } catch {
    return null;
  }
}
