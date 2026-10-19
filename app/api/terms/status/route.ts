import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { TERMS_VERSIONS, getRequiredTermsTypes, CEREMONY_REQUIRED_TYPES, type TermsType } from '@/lib/terms';

// base / organizer は デジタル同意だけで完了
// agent は デジタル同意 + admin確認(対面調印式)の両方が必要
const REQUIRES_CONFIRMATION = CEREMONY_REQUIRED_TYPES;

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('profile_id', user.id)
    .single();

  const role = profile?.role ?? '';
  const required = getRequiredTermsTypes(role);

  const { data: agreements } = await admin
    .from('terms_agreements')
    .select('terms_type, version, agreed_at, confirmed_at')
    .eq('profile_id', user.id);

  type AgreementRecord = {
    digitallySigned: boolean;
    confirmed: boolean;
  };
  const agreementMap = new Map<string, AgreementRecord>();
  for (const a of agreements ?? []) {
    const key = `${a.terms_type}:${a.version}`;
    agreementMap.set(key, {
      digitallySigned: !!a.agreed_at,
      confirmed: !!a.confirmed_at,
    });
  }

  // 過去に(現行と異なるバージョンで)同意した記録があるか。
  // 「新規登録」ではなく「規約改定による再同意」であることを画面に
  // 伝えるための判定材料。
  const hasAnyPastAgreement = (agreements ?? []).some((a) => !!a.agreed_at);

  // 型ごとに、現行版より前に同意した最新バージョン(あれば)を拾う。
  // 画面側で新旧を突き合わせ、改定箇所だけを示すために使う。
  const previousVersionByType = new Map<TermsType, string>();
  for (const a of agreements ?? []) {
    if (!a.agreed_at) continue;
    const t = a.terms_type as TermsType;
    if (a.version === TERMS_VERSIONS[t]) continue; // 現行版そのものは「過去」ではない
    const current = previousVersionByType.get(t);
    if (!current || a.version > current) previousVersionByType.set(t, a.version);
  }

  const status: Record<TermsType, {
    required: boolean;
    digitallySigned: boolean;
    confirmed: boolean;
    agreed: boolean;  // 完了条件を満たしているか
    needsConfirmation: boolean;
    version: string;
    previousVersion: string | null;
  }> = {} as never;

  for (const t of ['base', 'organizer', 'agent'] as TermsType[]) {
    const key = `${t}:${TERMS_VERSIONS[t]}`;
    const rec = agreementMap.get(key);
    const digitallySigned = rec?.digitallySigned ?? false;
    const confirmed = rec?.confirmed ?? false;
    const needsConfirmation = REQUIRES_CONFIRMATION.includes(t);
    const agreed = digitallySigned && (!needsConfirmation || confirmed);
    status[t] = {
      required: required.includes(t),
      digitallySigned,
      confirmed,
      agreed,
      needsConfirmation,
      version: TERMS_VERSIONS[t],
      previousVersion: previousVersionByType.get(t) ?? null,
    };
  }

  const allAgreed = required.every((t) => status[t].agreed);

  return NextResponse.json({ role, status, allAgreed, hasAnyPastAgreement });
}
