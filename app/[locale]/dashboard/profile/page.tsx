'use client';

import { useEffect, useState, useTransition, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import {
  User, Music, Globe, Camera,
  ArrowLeft, Loader2, Save, Mic2, CalendarDays, Shield, Smartphone, Share, Plus,
  CheckCircle, Clock, AlertCircle, Building2, Tag, FileText, Layers, ChevronRight,
} from 'lucide-react';
import Link from 'next/link';
import { ImageCropperModal } from '@/components/image-cropper-modal';

type Profile = {
  display_name: string;
  avatar_url: string | null;
  role: string;
  verification_status: string;
  pending_role: string | null;
  social_links: { instagram?: string; soundcloud?: string; website?: string };
  stripe_connect_id: string | null;
  bio: string | null;
  affiliation: string | null;
  credit_name: string | null;
  genre: string | null;
  organization_name: string | null;
  artist_name: string | null;
  organizer_name: string | null;
};

const roleLabel: Record<string, { label: string; icon: React.ReactNode }> = {
  user:      { label: 'ファン',           icon: <User size={14} /> },
  artist:    { label: 'アーティスト / DJ', icon: <Mic2 size={14} /> },
  organizer: { label: 'オーガナイザー',    icon: <CalendarDays size={14} /> },
  agent:     { label: 'エージェント',      icon: <Shield size={14} /> },
  admin:     { label: '管理者',           icon: <Shield size={14} /> },
};

function Field({
  label, icon, optional, hint, children,
}: {
  label: string; icon: React.ReactNode; optional?: boolean; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
        {icon} {label}
        {optional && <span className="text-slate-600 normal-case font-normal">（任意）</span>}
        {!optional && <span className="text-pink-500">*</span>}
      </label>
      {children}
      {hint && <p className="text-[10px] text-slate-600">{hint}</p>}
    </div>
  );
}

const inputClass = "w-full h-12 bg-slate-950/50 border border-slate-800 rounded-xl px-5 text-sm text-white focus:border-pink-500/50 outline-none transition-all placeholder:text-slate-700";
const textareaClass = "w-full bg-slate-950/50 border border-slate-800 rounded-xl px-5 py-3 text-sm text-white focus:border-pink-500/50 outline-none transition-all placeholder:text-slate-700 resize-none";

export default function ProfileEditPage() {
  const [profile, setProfile] = useState<Profile | null>(null);

  // 基本
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [instagram, setInstagram] = useState('');
  const [soundcloud, setSoundcloud] = useState('');
  const [website, setWebsite] = useState('');

  // ロール別
  const [bio, setBio] = useState('');
  const [affiliation, setAffiliation] = useState('');
  const [creditName, setCreditName] = useState('');
  const [genre, setGenre] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [artistName, setArtistName] = useState('');
  const [organizerName, setOrganizerName] = useState('');

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [showCropper, setShowCropper] = useState(false);
  const avatarFileRef = useRef<HTMLInputElement>(null);

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setCropSrc(url);
    setShowCropper(true);
    e.target.value = "";
  };

  const handleAvatarClick = () => {
    if (cropSrc) setShowCropper(true);
    else avatarFileRef.current?.click();
  };

  const handleCropComplete = async (blob: Blob) => {
    setShowCropper(false);
    // cropSrc は保持（再クロップ用）
    setAvatarUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", blob, "avatar.jpg");
      const res = await fetch("/api/avatar/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (data.url) setAvatarUrl(data.url);
      else toast.error("アップロードに失敗しました");
    } finally {
      setAvatarUploading(false);
    }
  };

  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [inviter, setInviter] = useState<{ display_name: string | null; profile_id: string } | null>(null);
  const router = useRouter();

  const applyProfileData = (data: Profile) => {
    setProfile(data);
    setDisplayName(data.display_name ?? '');
    setAvatarUrl(data.avatar_url ?? '');
    setInstagram(data.social_links?.instagram ?? '');
    setSoundcloud(data.social_links?.soundcloud ?? '');
    setWebsite(data.social_links?.website ?? '');
    setBio(data.bio ?? '');
    setAffiliation(data.affiliation ?? '');
    setCreditName(data.credit_name ?? '');
    setGenre(data.genre ?? '');
    setOrganizationName(data.organization_name ?? '');
    setArtistName(data.artist_name ?? '');
    setOrganizerName(data.organizer_name ?? '');
  };

  const fetchAndApplyProfile = async (supabase: ReturnType<typeof createClient>, userId: string) => {
    const { data: coreData } = await supabase
      .from('profiles')
      .select('display_name, avatar_url, role, verification_status, pending_role, social_links, stripe_connect_id')
      .eq('profile_id', userId)
      .single();

    if (!coreData) return null;

    const { data: extData } = await supabase
      .from('profiles')
      .select('bio, affiliation, credit_name, genre, organization_name, artist_name, organizer_name')
      .eq('profile_id', userId)
      .single();

    const data = { ...coreData, ...(extData ?? {}) } as Profile;
    applyProfileData(data);
    return data;
  };

  useEffect(() => {
    const init = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/auth/login'); return; }
      setEmail(user.email ?? '');
      await fetchAndApplyProfile(supabase, user.id);

      const { data: inv } = await supabase
        .from('invitations')
        .select('invited_by_profile_id, inviter:profiles!invited_by_profile_id(display_name)')
        .eq('accepted_by_profile_id', user.id)
        .maybeSingle();
      if (inv) {
        const inviterData = inv.inviter as unknown as { display_name: string | null };
        setInviter({ display_name: inviterData?.display_name ?? null, profile_id: inv.invited_by_profile_id });
      }

      setIsLoading(false);
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const handleSave = () => {
    if (!displayName.trim()) { toast.error('表示名を入力してください'); return; }

    startTransition(async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const socialLinks: Record<string, string> = {};
      if (instagram.trim()) socialLinks.instagram = instagram.trim();
      if (soundcloud.trim()) socialLinks.soundcloud = soundcloud.trim();
      if (website.trim()) socialLinks.website = website.trim();

      const role = profile?.role ?? 'user';
      const updates: Record<string, unknown> = {
        display_name: displayName.trim(),
        avatar_url: avatarUrl.trim() || null,
        social_links: socialLinks,
      };

      if (role === 'artist' || role === 'organizer' || role === 'agent') {
        updates.bio = bio.trim() || null;
      }
      if (role === 'artist') {
        updates.affiliation  = affiliation.trim() || null;
        updates.credit_name  = creditName.trim() || null;
        updates.genre        = genre.trim() || null;
        updates.artist_name  = artistName.trim() || null;
      }
      if (role === 'organizer' || role === 'agent') {
        updates.organization_name  = organizationName.trim() || null;
        updates.organizer_name     = organizerName.trim() || null;
      }
      if (role === 'agent' || role === 'admin') {
        updates.artist_name = artistName.trim() || null;
      }

      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? '保存に失敗しました');
      } else {
        // DB から再フェッチして profile state を確実に同期
        await fetchAndApplyProfile(supabase, user.id);
        router.refresh();
        toast.success('プロファイルを更新しました');
      }
    });
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-slate-600" size={32} /></div>;
  }

  const role = profile?.role ?? 'user';
  const isArtist    = role === 'artist';
  const isOrganizer = role === 'organizer';
  const isAgent     = role === 'agent';
  const isCreator   = isArtist || isOrganizer || isAgent;

  const stripeConnected = !!profile?.stripe_connect_id;

  return (
    <>
    {showCropper && cropSrc && (
      <ImageCropperModal
        imageSrc={cropSrc}
        aspect={1}
        outputWidth={400}
        outputHeight={400}
        label="1:1"
        onComplete={handleCropComplete}
        onCancel={() => setShowCropper(false)}
      />
    )}
    <div className="max-w-lg mx-auto space-y-8 pb-20">

      {/* ヘッダー */}
      <div className="flex items-center gap-4">
<div>
          <p className="text-[10px] font-black text-pink-500 uppercase tracking-[0.4em]">Settings</p>
          <h1 className="text-2xl font-black text-white italic uppercase tracking-tighter">Profile</h1>
        </div>
      </div>

      {/* ロールバッジ */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 border border-slate-800 rounded-full">
          <span className="text-slate-400">{roleLabel[role]?.icon}</span>
          <span className="text-[11px] font-black text-slate-300 uppercase tracking-wider">{roleLabel[role]?.label ?? role}</span>
        </div>
        {profile?.verification_status === 'pending' && (
          <div className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-full">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-[11px] font-black text-amber-400 uppercase tracking-wider">
              {profile.pending_role === 'artist' ? 'DJ / アーティスト申請中' : profile.pending_role === 'organizer' ? 'オーガナイザー申請中' : '審査中'}
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

      <div className="space-y-4">

        {/* ── 基本情報（全ロール） ── */}
        <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-6 space-y-5">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">基本情報</p>

          {/* メールアドレス（読み取り専用） */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
              <User size={11} className="text-slate-500" /> ログインID（メールアドレス）
            </label>
            <div className="w-full h-12 bg-slate-950/30 border border-slate-800 rounded-2xl px-5 flex items-center text-sm text-slate-400 select-all">
              {email}
            </div>
          </div>

          <Field label="表示名" icon={<User size={11} className="text-pink-500" />}>
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
              placeholder="名前またはニックネーム"
              className="w-full h-14 bg-slate-950/50 border border-slate-700 rounded-2xl px-5 text-sm text-white focus:border-pink-500 outline-none transition-all placeholder:text-slate-600 font-bold" />
          </Field>

          <Field label="アバター画像" icon={<Camera size={11} className="text-pink-500" />} optional>
            <div className="flex items-center gap-3">
              {/* アバター画像 — クリックで再クロップ or ファイル選択 */}
              <div
                onClick={handleAvatarClick}
                className="relative w-14 h-14 rounded-2xl overflow-hidden border border-slate-700 shrink-0 cursor-pointer group"
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover"
                    onError={(e) => (e.currentTarget.style.display = 'none')} />
                ) : (
                  <div className="w-full h-full bg-slate-800 flex items-center justify-center">
                    <Camera size={20} className="text-slate-600" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Camera size={16} className="text-white" />
                </div>
              </div>

              {/* ファイル選択ボタン */}
              <label className="flex-1 h-14 bg-slate-950/50 border border-dashed border-slate-700 rounded-2xl px-5 flex items-center gap-2 text-sm cursor-pointer hover:border-pink-500/50 transition-all">
                <input ref={avatarFileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarSelect} disabled={avatarUploading} />
                {avatarUploading
                  ? <><Loader2 size={16} className="animate-spin text-pink-500" /><span className="text-slate-400">アップロード中...</span></>
                  : <><Camera size={16} className="text-slate-500" /><span className="text-slate-500">別の画像を選択</span></>
                }
              </label>
            </div>
            {cropSrc && avatarUrl && (
              <p className="text-[10px] text-slate-600 mt-1">↑ 画像をタップすると再クロップできます</p>
            )}
          </Field>
        </div>

        {/* ── SNSリンク（全ロール） ── */}
        <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-6 space-y-5">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">
            SNS / リンク <span className="text-slate-700 normal-case font-normal">（任意）</span>
          </p>
          <Field label="Instagram" icon={<Globe size={11} className="text-pink-500" />} optional>
            <input type="text" value={instagram} onChange={(e) => setInstagram(e.target.value)}
              placeholder="https://instagram.com/yourname" className={inputClass} />
          </Field>
          {(isArtist || role === 'user') && (
            <Field label="SoundCloud" icon={<Music size={11} className="text-pink-500" />} optional>
              <input type="text" value={soundcloud} onChange={(e) => setSoundcloud(e.target.value)}
                placeholder="https://soundcloud.com/yourname" className={inputClass} />
            </Field>
          )}
          <Field label="Website" icon={<Globe size={11} className="text-pink-500" />} optional={!isCreator}
            hint={isCreator ? "口座登録に必要です" : undefined}>
            <input type="url" value={website} onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://yoursite.com" className={inputClass} />
          </Field>
        </div>

        {/* ── アーティスト専用 ── */}
        {isArtist && (
          <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-6 space-y-5">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">アーティスト情報</p>
            <Field label="アーティスト名（DJ名）" icon={<Mic2 size={11} className="text-pink-500" />} optional
              hint="ラインナップや通知・Walletに表示される名前。未入力なら表示名を使用">
              <input type="text" value={artistName} onChange={(e) => setArtistName(e.target.value)}
                placeholder="例: DJ TARO" className={inputClass} />
            </Field>
            <Field label="クレジット表記" icon={<Tag size={11} className="text-pink-500" />} optional
              hint="フライヤーやレシートに表示される正式クレジット名">
              <input type="text" value={creditName} onChange={(e) => setCreditName(e.target.value)}
                placeholder="例: Taro Yamamoto" className={inputClass} />
            </Field>
            <Field label="所属団体" icon={<Building2 size={11} className="text-pink-500" />} optional>
              <input type="text" value={affiliation} onChange={(e) => setAffiliation(e.target.value)}
                placeholder="例: RESIDENT × CREW NAME" className={inputClass} />
            </Field>
            <Field label="出演ジャンル / 演目" icon={<Layers size={11} className="text-pink-500" />} optional>
              <input type="text" value={genre} onChange={(e) => setGenre(e.target.value)}
                placeholder="例: Techno / House / Live DJ" className={inputClass} />
            </Field>
            <Field label="紹介文" icon={<FileText size={11} className="text-pink-500" />} optional>
              <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4}
                placeholder="あなた自身についての紹介文を書いてください" className={textareaClass} />
            </Field>
          </div>
        )}

        {/* ── オーガナイザー / エージェント専用 ── */}
        {(isOrganizer || isAgent) && (
          <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-6 space-y-5">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">
              {isOrganizer ? 'オーガナイザー情報' : 'エージェント情報'}
            </p>
            <Field label="主催者名" icon={<CalendarDays size={11} className="text-pink-500" />} optional
              hint="イベント主催者として表示される名前。未入力なら表示名を使用">
              <input type="text" value={organizerName} onChange={(e) => setOrganizerName(e.target.value)}
                placeholder="例: TARO EVENTS" className={inputClass} />
            </Field>
            <Field label="活動団体名" icon={<Building2 size={11} className="text-pink-500" />} optional>
              <input type="text" value={organizationName} onChange={(e) => setOrganizationName(e.target.value)}
                placeholder="例: XYZ PRODUCTION / RESIDENT COLLECTIVE" className={inputClass} />
            </Field>
            <Field label="紹介文" icon={<FileText size={11} className="text-pink-500" />} optional>
              <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4}
                placeholder="活動内容や実績を入力してください" className={textareaClass} />
            </Field>
          </div>
        )}

        {/* ── エージェント: アーティスト名（自身がDJとしても活動する場合） ── */}
        {isAgent && (
          <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-6 space-y-5">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">DJとして出演する場合</p>
            <Field label="アーティスト名（DJ名）" icon={<Mic2 size={11} className="text-pink-500" />} optional
              hint="ラインナップや通知・Walletに表示される名前。未入力なら表示名を使用">
              <input type="text" value={artistName} onChange={(e) => setArtistName(e.target.value)}
                placeholder="例: DJ TARO" className={inputClass} />
            </Field>
          </div>
        )}

        {/* ── 売上受取口座 ── */}
        {isCreator && (
          <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-6 space-y-4">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">売上受取口座</p>

            {stripeConnected && profile?.verification_status === 'verified' && (
              <div className="flex items-center gap-3 px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
                <CheckCircle size={16} className="text-emerald-400 shrink-0" />
                <div>
                  <p className="text-sm text-emerald-400 font-black">審査完了 — 受取可能</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Stripe Connect 連携済み</p>
                </div>
              </div>
            )}

            {stripeConnected && profile?.verification_status === 'pending' && (
              <div className="flex items-center gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
                <Clock size={16} className="text-amber-400 shrink-0" />
                <div>
                  <p className="text-sm text-amber-400 font-black">口座開設審査中</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Stripe審査完了 — プラットフォームオーナーによる審査待ち</p>
                </div>
              </div>
            )}

            {profile?.verification_status === 'rejected' && (
              <div className="flex items-center gap-3 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-2xl">
                <AlertCircle size={16} className="text-red-400 shrink-0" />
                <div>
                  <p className="text-sm text-red-400 font-black">審査却下</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {inviter ? `担当エージェント（${inviter.display_name ?? '—'}）にご確認ください` : 'エージェントにお問い合わせください'}
                  </p>
                </div>
              </div>
            )}

            {(!stripeConnected || profile?.verification_status === 'unverified' || profile?.verification_status === 'rejected') && (
              <Link
                href="/dashboard/profile/bank-setup"
                className="flex items-center justify-between w-full h-12 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:brightness-110 text-white rounded-2xl px-5 font-black text-xs uppercase tracking-widest transition-all"
              >
                <span>{profile?.verification_status === 'rejected' ? '再申請する' : '口座登録・本人確認を始める'}</span>
                <ChevronRight size={16} />
              </Link>
            )}

            {inviter && (
              <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-800/50 rounded-2xl">
                <Shield size={12} className="text-slate-500 shrink-0" />
                <p className="text-[11px] text-slate-500">
                  担当エージェント: <span className="text-slate-300 font-bold">{inviter.display_name ?? '—'}</span>
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 保存ボタン */}
      <button onClick={handleSave} disabled={isPending}
        className="w-full h-16 bg-gradient-to-r from-pink-600 to-pink-500 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] hover:brightness-110 transition-all shadow-[0_0_30px_rgba(236,72,153,0.3)] active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed">
        {isPending ? <Loader2 size={20} className="animate-spin" /> : <><Save size={18} /> 保存する</>}
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

      {/* アカウント管理（パスワード設定・履歴統合） */}
      <Link
        href="/dashboard/account"
        className="flex items-center justify-between bg-slate-900 border border-slate-800 hover:border-pink-500/30 rounded-[2.5rem] p-6 transition-all group"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-800 rounded-2xl flex items-center justify-center group-hover:bg-pink-500/10 transition-colors">
            <Shield size={18} className="text-slate-400 group-hover:text-pink-500 transition-colors" />
          </div>
          <div>
            <p className="text-sm font-black text-white">アカウント管理</p>
            <p className="text-[11px] text-slate-500 mt-0.5">パスワード設定・応援履歴の統合</p>
          </div>
        </div>
        <ArrowLeft size={16} className="text-slate-600 rotate-180 group-hover:text-pink-500 transition-colors" />
      </Link>

      {/* パスキー管理 */}
      <Link
        href="/dashboard/passkeys"
        className="flex items-center justify-between bg-slate-900 border border-slate-800 hover:border-pink-500/30 rounded-[2.5rem] p-6 transition-all group"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-800 rounded-2xl flex items-center justify-center group-hover:bg-pink-500/10 transition-colors">
            <Smartphone size={18} className="text-slate-400 group-hover:text-pink-500 transition-colors" />
          </div>
          <div>
            <p className="text-sm font-black text-white">パスキー管理</p>
            <p className="text-[11px] text-slate-500 mt-0.5">顔認証・指紋認証でログインできるデバイスを管理</p>
          </div>
        </div>
        <ArrowLeft size={16} className="text-slate-600 rotate-180 group-hover:text-pink-500 transition-colors" />
      </Link>

    </div>
    </>
  );
}
