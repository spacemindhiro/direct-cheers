import { createClient } from "@supabase/supabase-js";

/**
 * Service Role クライアント。RLS をバイパスするため API ルート専用で使用する。
 * クライアントサイドでは絶対に使わないこと。
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
