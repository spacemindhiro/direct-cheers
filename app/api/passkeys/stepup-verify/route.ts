import { NextResponse, type NextRequest } from 'next/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const STEP_UP_MAX_AGE = 1440 * 60; // 24時間（秒単位）

function getRpIdAndOrigin(req: Request) {
  const host = req.headers.get('host') ?? 'localhost';
  const rpId = host.split(':')[0];
  const origin = req.headers.get('origin') ?? (rpId === 'localhost' ? 'http://localhost:3000' : `https://${rpId}`);
  return { rpId, origin };
}

function toUint8Array(val: unknown): Uint8Array<ArrayBuffer> {
  if (typeof val === 'string') {
    const raw = val.startsWith('\\x') ? Buffer.from(val.slice(2), 'hex') : Buffer.from(val, 'base64');
    const str = raw.toString('utf8');
    if (str.startsWith('{"type":"Buffer"')) {
      try {
        const json = JSON.parse(str) as { type: string; data: number[] };
        if (json.type === 'Buffer' && Array.isArray(json.data)) {
          return Uint8Array.from(json.data) as Uint8Array<ArrayBuffer>;
        }
      } catch { /* fall through */ }
    }
    return Uint8Array.from(raw) as Uint8Array<ArrayBuffer>;
  }
  if (Buffer.isBuffer(val)) return Uint8Array.from(val) as Uint8Array<ArrayBuffer>;
  if (val instanceof Uint8Array) return Uint8Array.from(val) as Uint8Array<ArrayBuffer>;
  if (Array.isArray(val)) return Uint8Array.from(val as number[]) as Uint8Array<ArrayBuffer>;
  throw new Error(`public_key の型が不明: ${typeof val}`);
}

export async function POST(req: NextRequest) {
  const { rpId: RP_ID, origin: ORIGIN } = getRpIdAndOrigin(req);
  const { credential } = await req.json() as { credential: AuthenticationResponseJSON };

  if (!credential) {
    return NextResponse.json({ error: 'Missing credential' }, { status: 400 });
  }

  // 現在のセッションユーザーを確認
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  // チャレンジを取得
  const clientData = JSON.parse(
    Buffer.from(credential.response.clientDataJSON, 'base64url').toString('utf-8'),
  );
  const challenge = clientData.challenge;

  const { data: challengeRow } = await admin
    .from('passkey_challenges')
    .select('challenge_id, expires_at')
    .eq('challenge', challenge)
    .eq('purpose', 'authentication')
    .maybeSingle();

  if (!challengeRow) {
    return NextResponse.json({ error: 'Invalid challenge' }, { status: 400 });
  }
  if (new Date(challengeRow.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Challenge expired' }, { status: 400 });
  }

  // クレデンシャルを取得
  const { data: storedCred } = await admin
    .from('passkey_credentials')
    .select('credential_id, profile_id, public_key, counter, transports')
    .eq('credential_id', credential.id)
    .maybeSingle();

  if (!storedCred) {
    return NextResponse.json({ error: 'Credential not found' }, { status: 404 });
  }

  // クレデンシャルが現在のユーザーのものであることを確認
  if (storedCred.profile_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // WebAuthn 検証
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
      credential: {
        id: storedCred.credential_id,
        publicKey: toUint8Array(storedCred.public_key),
        counter: storedCred.counter,
        transports: storedCred.transports ?? [],
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  if (!verification.verified) {
    return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
  }

  // カウンター更新・チャレンジ削除
  await Promise.all([
    admin
      .from('passkey_credentials')
      .update({ counter: verification.authenticationInfo.newCounter, updated_at: new Date().toISOString() })
      .eq('credential_id', storedCred.credential_id),
    admin
      .from('passkey_challenges')
      .delete()
      .eq('challenge_id', challengeRow.challenge_id),
  ]);

  // dc_stepup クッキーをセット（HttpOnly・Secure・480分有効）
  const response = NextResponse.json({ success: true });
  response.cookies.set('dc_stepup', Date.now().toString(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: STEP_UP_MAX_AGE,
    path: '/',
  });

  return response;
}
