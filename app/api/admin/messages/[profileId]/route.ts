import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendAdminMessageEmail } from '@/lib/email/notification';

// GET: スレッド取得 + 未読を既読に
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ profileId: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('profile_id', user.id).single();
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { profileId } = await params;

  const { data: messages } = await admin
    .from('admin_messages')
    .select('id, body, is_from_admin, is_read_by_admin, is_read_by_user, created_at, sender_id')
    .eq('user_profile_id', profileId)
    .order('created_at', { ascending: true });

  // ユーザーからの未読を既読にする
  await admin
    .from('admin_messages')
    .update({ is_read_by_admin: true })
    .eq('user_profile_id', profileId)
    .eq('is_from_admin', false)
    .eq('is_read_by_admin', false);

  return NextResponse.json({ messages: messages ?? [] });
}

// POST: メッセージ送信
export async function POST(
  req: Request,
  { params }: { params: Promise<{ profileId: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role, display_name').eq('profile_id', user.id).single();
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { profileId } = await params;
  const { body } = await req.json() as { body: string };
  if (!body?.trim()) return NextResponse.json({ error: 'body required' }, { status: 400 });

  const { data: msg, error } = await admin
    .from('admin_messages')
    .insert({
      user_profile_id:  profileId,
      sender_id:        user.id,
      body:             body.trim(),
      is_from_admin:    true,
      is_read_by_user:  false,
      is_read_by_admin: true,
    })
    .select('id, body, is_from_admin, is_read_by_user, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ユーザーへメール通知（fire-and-forget）
  try {
    const { data: authUser } = await admin.auth.admin.getUserById(profileId);
    if (authUser.user?.email) {
      await sendAdminMessageEmail({
        to:        authUser.user.email,
        body:      body.trim(),
        adminName: me.display_name ?? 'Direct Cheers 管理者',
      });
    }
  } catch { /* メール失敗はサイレント */ }

  return NextResponse.json({ message: msg });
}
