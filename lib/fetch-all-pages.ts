import { createAdminClient } from "@/lib/supabase/admin";

// SupabaseAdmin相当の型（admin.from(table)が返すPostgrestQueryBuilderにrange()を呼べれば良い）
type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * PostgREST（Supabase）は .select() に .limit()/.range() を指定しない場合、
 * デフォルトで最大1000件しか返さない（超過分はエラーにならず黙って落ちる）。
 * バッチ処理の対象行が1000件を超えると、超えた分の処理がサイレントに無視される。
 * .range() でページングしながら全件を取得する。
 *
 * cron/reconcile と cron/auto-cancel-unsettled で共用。
 */
export async function fetchAllPages<T>(
  admin: AdminClient,
  table: string,
  columns: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  applyFilters: (q: any) => any,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await applyFilters(admin.from(table).select(columns))
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}
