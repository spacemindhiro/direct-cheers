import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { TERMS_VERSIONS, getRequiredTermsTypes, type TermsType } from '@/lib/terms';

// base は デジタル同意だけで完了
// organizer / agent は デジタル同意 + admin確認の両方が必要
const REQUIRES_CONFIRMATION: TermsType[] = ['organizer', 'agent'];

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

  const status: Record<TermsType, {
    required: boolean;
    digitallySigned: boolean;
    confirmed: boolean;
    agreed: boolean;  // 完了条件を満たしているか
    needsConfirmation: boolean;
    version: string;
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
    };
  }

  const allAgreed = required.every((t) => status[t].agreed);

  return NextResponse.json({ role, status, allAgreed });
}
