'use client';

import { useEffect, useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import {
  User, Music, Globe, Camera,
  ArrowLeft, Loader2, Save, Mic2, CalendarDays, Shield
} from 'lucide-react';
import Link from 'next/link';

type Profile = {
  display_name: string;
  avatar_url: string | null;
  role: string;
  verification_status: string;
  pending_role: string | null;
  social_links: {
    instagram?: string;
    soundcloud?: string;
    website?: string;
  };
  stripe_connect_id: string | null;
};

const roleLabel: Record<string, { label: string; icon: React.ReactNode }> = {
  user:      { label: 'ファン',           icon: <User size={14} /> },
  artist:    { label: 'アーティスト / DJ', icon: <Mic2 size={14} /> },
  organizer: { label: 'オーガナイザー',    icon: <CalendarDays size={14} /> },
  agent:     { label: 'エージェント',      icon: <Shield size={14} /> },
  admin:     { label: '管理者',           icon: <Shield size={14} /> },
};

export default function ProfileEditPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [instagram, setInstagram] = useState('');
  const [soundcloud, setSoundcloud] = useState('');
  const [website, setWebsite] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    const fetchProfile = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/auth/login'); return; }

      const { data } = await supabase
        .from('profiles')
        .select('display_name, avatar_url, role, verification_status, pending_role, social_links, stripe_connect_id')
        .eq('profile_id', user.id)
        .single();

      if (data) {
        setProfile(data);
        setDisplayName(data.display_name ?? '');
        setAvatarUrl(data.avatar_url ?? '');
        setInstagram(data.social_links?.instagram ?? '');
        setSoundcloud(data.social_links?.soundcloud ?? '');
        setWebsite(data.social_links?.website ?? '');
      }
      setIsLoading(false);
    };
    fetchProfile();
  }, [router]);

  const handleSave = () => {
    if (!displayName.trim()) {
      toast.error('表示名を入力してください');
      return;
    }
    startTransition(async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const socialLinks: Record<string, string> = {};
      if (instagram.trim()) socialLinks.instagram = instagram.trim();
      if (soundcloud.trim()) socialLinks.soundcloud = soundcloud.trim();
      if (website.trim()) socialLinks.website = website.trim();

      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: displayName.trim(),
          avatar_url: avatarUrl.trim() || null,
          social_links: socialLinks,
        })
        .eq('profile_id', user.id);

      if (error) {
        toast.error('保存に失敗しました');
      } else {
        toast.success('プロファイルを更新しました');
      }
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-slate-600" size={32} />
      </div>
    );
  }

  const role = profile?.role ?? 'user';
  const isCreator = role === 'artist' || role === 'organizer';

  return (
    <div className="max-w-lg mx-auto space-y-8 pb-20">

      {/* ヘッダー */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard"
          className="w-10 h-10 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center text-slate-400 hover:text-white hover:border-slate-600 transition-all"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">Settings</p>
          <h1 className="text-2xl font-black text-white italic uppercase tracking-tighter">Profile</h1>
        </div>
      </div>

      {/* ロールバッジ */}
      <div className="flex items-center gap-2">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 border border-slate-800 rounded-full">
          <span className="text-slate-400">{roleLabel[role]?.icon}</span>
          <span className="text-[11px] font-black text-slate-300 uppercase tracking-wider">
            {roleLabel[role]?.label ?? role}
          </span>
        </div>
        {profile?.verification_status === 'pending' && (
          <div className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-full">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-[11px] font-black text-amber-400 uppercase tracking-wider">審査中</span>
          </div>
        )}
        {profile?.verification_status === 'verified' && (
          <div className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-full">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-[11px] font-black text-emerald-400 uppercase tracking-wider">認証済み</span>
          </div>
        )}
      </div>

      {/* フォーム */}
      <div className="space-y-4">

        {/* 基本情報 */}
        <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-6 space-y-5">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">基本情報</p>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
              <User size={11} className="text-pink-500" /> 表示名 <span className="text-pink-500">*</span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="名前またはニックネーム"
              className="w-full h-14 bg-slate-950/50 border border-slate-700 rounded-2xl px-5 text-sm text-white focus:border-pink-500 outline-none transition-all placeholder:text-slate-600 font-bold"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
              <Camera size={11} className="text-pink-500" /> アバター URL
              <span className="text-slate-600 normal-case font-normal">（任意）</span>
            </label>
            <div className="flex items-center gap-3">
              {avatarUrl && (
                <img
                  src={avatarUrl}
                  alt="avatar"
                  className="w-12 h-12 rounded-2xl object-cover border border-slate-700 shrink-0"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
              )}
              <input
                type="url"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://..."
                className="flex-1 h-14 bg-slate-950/50 border border-slate-700 rounded-2xl px-5 text-sm text-white focus:border-pink-500 outline-none transition-all placeholder:text-slate-600"
              />
            </div>
          </div>
        </div>

        {/* SNSリンク（全ロール） */}
        <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-6 space-y-5">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">
            SNS / リンク
            <span className="text-slate-700 normal-case font-normal ml-2">（任意）</span>
          </p>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
              <Globe size={11} className="text-pink-500" /> Instagram
            </label>
            <input
              type="text"
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              placeholder="https://instagram.com/yourname"
              className="w-full h-12 bg-slate-950/50 border border-slate-800 rounded-xl px-5 text-sm text-white focus:border-pink-500/50 outline-none transition-all placeholder:text-slate-700"
            />
          </div>

          {(role === 'artist' || role === 'user') && (
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
                <Music size={11} className="text-pink-500" /> SoundCloud
              </label>
              <input
                type="text"
                value={soundcloud}
                onChange={(e) => setSoundcloud(e.target.value)}
                placeholder="https://soundcloud.com/yourname"
                className="w-full h-12 bg-slate-950/50 border border-slate-800 rounded-xl px-5 text-sm text-white focus:border-pink-500/50 outline-none transition-all placeholder:text-slate-700"
              />
            </div>
          )}

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
              <Globe size={11} className="text-pink-500" /> Website
            </label>
            <input
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://yoursite.com"
              className="w-full h-12 bg-slate-950/50 border border-slate-800 rounded-xl px-5 text-sm text-white focus:border-pink-500/50 outline-none transition-all placeholder:text-slate-700"
            />
          </div>
        </div>

        {/* Stripe Connect（アーティスト・オーガナイザーのみ） */}
        {isCreator && (
          <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-6 space-y-4">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">売上受取口座</p>
            {profile?.stripe_connect_id ? (
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <p className="text-sm text-emerald-400 font-black">Stripe Connect 連携済み</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-500 leading-relaxed">
                  売上を受け取るにはStripe Connectへの登録が必要です。
                  登録はエージェントが対面で案内します。
                </p>
                <div className="flex items-center gap-2 px-4 py-3 bg-amber-500/5 border border-amber-500/20 rounded-2xl">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  <p className="text-[11px] text-amber-400 font-bold">未連携</p>
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {/* 保存ボタン */}
      <button
        onClick={handleSave}
        disabled={isPending}
        className="w-full h-16 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] hover:brightness-110 transition-all shadow-[0_0_30px_rgba(236,72,153,0.3)] active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isPending ? (
          <Loader2 size={20} className="animate-spin" />
        ) : (
          <><Save size={18} /> 保存する</>
        )}
      </button>

    </div>
  );
}
