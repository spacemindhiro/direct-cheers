import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendUserReplyEmail } from '@/lib/email/notification';

// GET: 自分宛のスレッド取得 + adminからの未読を既読に
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  const { data: messages } = await admin
    .from('admin_messages')
    .select('id, body, is_from_admin, is_read_by_user, created_at')
    .eq('user_profile_id', user.id)
    .order('created_at', { ascending: true });

  // adminからの未読を既読に
  await admin
    .from('admin_messages')
    .update({ is_read_by_user: true })
    .eq('user_profile_id', user.id)
    .eq('is_from_admin', true)
    .eq('is_read_by_user', false);

  return NextResponse.json({ messages: messages ?? [] });
}

// POST: 返信送信
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('display_name').eq('profile_id', user.id).single();

  const { body } = await req.json() as { body: string };
  if (!body?.trim()) return NextResponse.json({ error: 'body required' }, { status: 400 });

  const { data: msg, error } = await admin
    .from('admin_messages')
    .insert({
      user_profile_id:  user.id,
      sender_id:        user.id,
      body:             body.trim(),
      is_from_admin:    false,
      is_read_by_user:  true,
      is_read_by_admin: false,
    })
    .select('id, body, is_from_admin, is_read_by_user, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // adminへメール通知（fire-and-forget）
  try {
    const { data: admins } = await admin
      .from('profiles')
      .select('profile_id')
      .eq('role', 'admin');

    if (admins && admins.length > 0) {
      const adminEmails: string[] = [];
      for (const a of admins) {
        const { data: au } = await admin.auth.admin.getUserById(a.profile_id);
        if (au.user?.email) adminEmails.push(au.user.email);
      }
      if (adminEmails.length > 0) {
        await sendUserReplyEmail({
          to:        adminEmails,
          body:      body.trim(),
          userName:  me?.display_name ?? 'ユーザー',
          profileId: user.id,
        });
      }
    }
  } catch { /* メール失敗はサイレント */ }

  return NextResponse.json({ message: msg });
}
