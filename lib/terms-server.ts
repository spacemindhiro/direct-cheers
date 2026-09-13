import { createAdminClient } from "@/lib/supabase/admin";
import { getRequiredTermsTypes, TERMS_VERSIONS, type TermsType } from "@/lib/terms";

// このユーザーが、必須の規約種別のうちデジタル同意(agreed_at)が最新版に
// 対して済んでいないものを返す。admin確認(対面調印式)の要否は問わない
// (/api/terms/statusのallAgreedとは異なり、ここではチェックボックスだけを見る)。
// /api/terms/status と同じ admin client でDBを読むことで、ユーザー権限
// クライアントとの読み取り結果の食い違い(RLS等)によるリダイレクトループ
// を避ける。
export async function getPendingDigitalTermsTypes(
  profileId: string,
  role: string,
): Promise<TermsType[]> {
  const requiredTerms = getRequiredTermsTypes(role);
  if (requiredTerms.length === 0) return [];

  const admin = createAdminClient();
  const { data: agreements } = await admin
    .from("terms_agreements")
    .select("terms_type, version, agreed_at")
    .eq("profile_id", profileId)
    .in("terms_type", requiredTerms);

  const digitallySignedTypes = new Set(
    (agreements ?? [])
      .filter((a) => a.agreed_at && a.version === TERMS_VERSIONS[a.terms_type as TermsType])
      .map((a) => a.terms_type),
  );

  return requiredTerms.filter((t) => !digitallySignedTypes.has(t));
}
