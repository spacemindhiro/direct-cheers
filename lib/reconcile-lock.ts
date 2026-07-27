// 照合(reconcile)の同一PIグループに対する同時実行を防ぐための行ロック。
// 手動照合の実行中にもう一度実行される等で同一PIが並行処理されると、
// 兄弟行(ウェルカムチア2階建て等)の按分の「端数を最後の行へ寄せる」判定が
// 崩れ、揃っていない方の実行がMath.floor()のみの計算で1円失う不整合が
// 起きる(2026-07-27 本番で発生・確認)。PostgreSQLのセッション単位アドバイザリ
// ロックはSupabaseのコネクションプーラー経由では確実に機能しないため、
// 通常のテーブル行 + 主キー制約による排他制御を使う。
const STALE_MS = 5 * 60 * 1000;

export async function acquirePiLock(admin: any, piId: string): Promise<boolean> {
  const { error: insertError } = await admin
    .from("reconcile_pi_locks")
    .insert({ pi_id: piId });
  if (!insertError) return true;

  const { data: existing } = await admin
    .from("reconcile_pi_locks")
    .select("pi_id, locked_at")
    .eq("pi_id", piId)
    .maybeSingle();
  if (!existing) return false;

  const isStale = Date.now() - new Date(existing.locked_at).getTime() > STALE_MS;
  if (!isStale) return false;

  const { data: updated } = await admin
    .from("reconcile_pi_locks")
    .update({ locked_at: new Date().toISOString() })
    .eq("pi_id", piId)
    .eq("locked_at", existing.locked_at)
    .select("pi_id");
  return (updated?.length ?? 0) > 0;
}

export async function releasePiLock(admin: any, piId: string): Promise<void> {
  await admin.from("reconcile_pi_locks").delete().eq("pi_id", piId);
}
