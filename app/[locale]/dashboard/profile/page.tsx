'use client';

import { useEffect, useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import {
  User, Music, Globe, Camera,
  ArrowLeft, Loader2, Save, Mic2, CalendarDays, Shield, Smartphone, Share, Plus,
  ExternalLink, CheckCircle, Clock, AlertCircle
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
  const [isConnecting, setIsConnecting] = useState(false);
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
  const isCreator = role === 'artist' || role === 'organizer' || role === 'agent';

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
            <span className="text-[11px] font-black text-amber-400 uppercase tracking-wider">
              {profile.pending_role === 'artist' && 'DJ / アーティスト申請中'}
              {profile.pending_role === 'organizer' && 'オーガナイザー申請中'}
              {!profile.pending_role && '審査中'}
            </span>
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

            {/* 連携済み + プラットフォーム審査通過 */}
            {profile?.stripe_connect_id && profile.verification_status === 'verified' && (
              <div className="flex items-center gap-3 px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
                <CheckCircle size={16} className="text-emerald-400 shrink-0" />
                <div>
                  <p className="text-sm text-emerald-400 font-black">審査完了 — 受取可能</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Stripe Connect 連携済み</p>
                </div>
              </div>
            )}

            {/* Stripe審査通過 → プラットフォーム審査待ち */}
            {profile?.stripe_connect_id && profile.verification_status === 'pending' && (
              <div className="flex items-center gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
                <Clock size={16} className="text-amber-400 shrink-0" />
                <div>
                  <p className="text-sm text-amber-400 font-black">口座開設審査中</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Stripe審査完了 — プラットフォームオーナーによる口座開設審査待ち</p>
                </div>
              </div>
            )}

            {/* Stripe Connect未連携 or 審査前 */}
            {(!profile?.stripe_connect_id || profile.verification_status === 'unverified') && (
              <div className="space-y-4">
                <p className="text-xs text-slate-500 leading-relaxed">
                  売上を受け取るには本人確認と口座登録が必要です。Stripeの審査を通過後、プラットフォームの審査に進みます。
                </p>
                <div className="space-y-2 text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-[9px] font-black text-indigo-400">1</div>
                    <span>Stripe本人確認・口座登録（このボタンから）</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-[9px] font-black text-slate-400">2</div>
                    <span>Stripe審査（数分〜数日）</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-[9px] font-black text-slate-400">3</div>
                    <span>プラットフォームオーナーによる口座開設審査</span>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isConnecting}
                  onClick={async () => {
                    setIsConnecting(true);
                    try {
                      const res = await fetch('/api/stripe/connect/onboarding', { method: 'POST' });
                      const data = await res.json();
                      if (data.url) {
                        window.location.href = data.url;
                      } else {
                        toast.error(data.error ?? 'エラーが発生しました');
                        setIsConnecting(false);
                      }
                    } catch {
                      toast.error('通信エラーが発生しました');
                      setIsConnecting(false);
                    }
                  }}
                  className="w-full h-12 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:brightness-110 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isConnecting ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <><ExternalLink size={14} /> 口座登録・本人確認を始める</>
                  )}
                </button>
              </div>
            )}

            {/* 審査却下 */}
            {profile?.verification_status === 'rejected' && (
              <div className="flex items-center gap-3 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-2xl">
                <AlertCircle size={16} className="text-red-400 shrink-0" />
                <div>
                  <p className="text-sm text-red-400 font-black">審査却下</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">エージェントにお問い合わせください</p>
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

      {/* ホーム画面に追加 */}
      <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-6 space-y-4">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] flex items-center gap-2">
          <Smartphone size={11} className="text-pink-500" /> ホーム画面に追加
        </p>
        <p className="text-xs text-slate-500 leading-relaxed">
          アプリのようにすぐ起動できます。Safariで開いている場合は以下の手順で追加できます。
        </p>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-slate-800 rounded-xl flex items-center justify-center shrink-0">
              <Share size={14} className="text-slate-400" />
            </div>
            <p className="text-xs text-slate-400">1. 画面下の共有ボタン（四角に矢印）をタップ</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-slate-800 rounded-xl flex items-center justify-center shrink-0">
              <Plus size={14} className="text-slate-400" />
            </div>
            <p className="text-xs text-slate-400">2.「ホーム画面に追加」を選択して完了</p>
          </div>
        </div>
      </div>

    </div>
  );
}
