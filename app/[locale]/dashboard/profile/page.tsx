'use client';

import { DISPLAY_TZ } from "@/lib/display-tz";
import { useEffect, useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import {
  User, Music, Globe, Camera,
  ArrowLeft, Loader2, Save, Mic2, CalendarDays, Shield, Smartphone, Tablet, Share, Plus,
  CheckCircle, Clock, AlertCircle, Building2, Tag, FileText, Layers, ChevronRight, Receipt,
} from 'lucide-react';
import Link from 'next/link';
import { PwaInstallButton } from '@/components/pwa-install-button';
import { StatementDescriptorPreview } from '@/components/statement-descriptor-preview';
import { AvatarUploadField } from '@/components/avatar-upload-field';
import { sanitizeStatementDescriptorSuffix } from '@/lib/statement-descriptor';

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
  artist_name_ascii: string | null;
  organizer_name_ascii: string | null;
  artist_avatar_url: string | null;
  organizer_avatar_url: string | null;
};

const roleLabel: Record<string, { label: string; icon: React.ReactNode }> = {
  user:      { label: 'メンバー',          icon: <User size={14} /> },
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
  const [artistNameAscii, setArtistNameAscii] = useState('');
  const [organizerNameAscii, setOrganizerNameAscii] = useState('');
  const [artistAvatarUrl, setArtistAvatarUrl] = useState('');
  const [organizerAvatarUrl, setOrganizerAvatarUrl] = useState('');

  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [inviter, setInviter] = useState<{ display_name: string | null; profile_id: string } | null>(null);
  const [signedDoc, setSignedDoc] = useState<{ id: string; signed_at: string } | null>(null);
  const [platform, setPlatform] = useState<'ios' | 'android' | 'other'>('other');
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
    // 海外カード明細用の英字表記。未設定なら名前から自動生成した値を表示する
    // （DBにはnullのまま=自動生成にお任せの状態。ユーザーが編集して保存すると
    // 明示的な上書きとして保存される。空にして保存すれば自動生成に戻る）
    setArtistNameAscii(data.artist_name_ascii ?? sanitizeStatementDescriptorSuffix(data.artist_name) ?? '');
    setOrganizerNameAscii(data.organizer_name_ascii ?? sanitizeStatementDescriptorSuffix(data.organizer_name) ?? '');
    setArtistAvatarUrl(data.artist_avatar_url ?? '');
    setOrganizerAvatarUrl(data.organizer_avatar_url ?? '');
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
      .select('bio, affiliation, credit_name, genre, organization_name, artist_name, organizer_name, artist_name_ascii, organizer_name_ascii, artist_avatar_url, organizer_avatar_url')
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

      fetch('/api/profile/signed-document')
        .then((r) => r.ok ? r.json() : null)
        .then((data) => { if (data?.document) setSignedDoc(data.document); });

      setIsLoading(false);
    };
    init();

    const ua = navigator.userAgent;
    if (/android/i.test(ua)) setPlatform('android');
    else if (/iphone|ipad|ipod/i.test(ua)) setPlatform('ios');
    else setPlatform('other');
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
      }
      if (role === 'organizer' || role === 'agent') {
        updates.organization_name     = organizationName.trim() || null;
        updates.organizer_name        = organizerName.trim() || null;
        updates.organizer_name_ascii  = organizerNameAscii.trim() || null;
        updates.organizer_avatar_url  = organizerAvatarUrl.trim() || null;
      }
      // artist_name/artist_avatar_url は「アーティスト専用」セクション（role='artist'）と
      // 「DJとして出演する場合」セクション（role='organizer'|'agent'）の両方で
      // 編集可能なため、UIに表示される全ロールでupdatesに含める必要がある。
      // organizerが漏れていたため、保存してもDBに反映されない（再取得時に
      // 元の値に戻り「消えた」ように見える）バグがあった。
      if (role === 'artist' || role === 'organizer' || role === 'agent') {
        updates.artist_name       = artistName.trim() || null;
        updates.artist_name_ascii = artistNameAscii.trim() || null;
        updates.artist_avatar_url = artistAvatarUrl.trim() || null;
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
            <AvatarUploadField value={avatarUrl} onChange={setAvatarUrl} placeholderLabel="別の画像を選択" />
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
            hint={isCreator ? "Stripe審査に使用。口座登録手続き（Step 5）でも入力できます" : undefined}>
            <input type="url" value={website} onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://yoursite.com" className={inputClass} />
          </Field>
        </div>

        {/* ── アーティスト専用 ── */}
        {isArtist && (
          <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-6 space-y-5">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">アーティスト情報</p>
            <Field label="アーティスト名（DJ名）" icon={<Mic2 size={11} className="text-pink-500" />} optional
              hint="ラインナップや通知・Wallet・お客様のカード利用明細にも表示される名前。未入力なら表示名を使用">
              <input type="text" value={artistName} onChange={(e) => setArtistName(e.target.value)}
                placeholder="例: DJ TARO" className={inputClass} />
            </Field>
            <Field label="アーティスト用の画像" icon={<Camera size={11} className="text-pink-500" />} optional
              hint="演者名義のチアで使われる画像（Walletカード等）。未設定なら基本のアバター画像を使用">
              <AvatarUploadField value={artistAvatarUrl} onChange={setArtistAvatarUrl} placeholderLabel="演者用の画像を選択" />
            </Field>
            <Field label="海外カード明細用の英字表記" icon={<Receipt size={11} className="text-pink-500" />} optional
              hint="海外発行カードの利用明細はアーティスト名の漢字部分が表示されないため、英字表記を個別に指定できます。未入力ならアーティスト名から自動生成">
              <input type="text" value={artistNameAscii} onChange={(e) => setArtistNameAscii(e.target.value)}
                placeholder="例: DJ TARO" className={inputClass} />
            </Field>
            <StatementDescriptorPreview role="artist" name={artistName} nameAscii={artistNameAscii} />
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
              {isOrganizer ? 'オーガナイザー情報' : 'オーガナイザーとして利用時の情報'}
            </p>
            <Field label="主催者名" icon={<CalendarDays size={11} className="text-pink-500" />} optional
              hint="イベント主催者として表示される名前。お客様のカード利用明細にも表示されます。未入力なら表示名を使用">
              <input type="text" value={organizerName} onChange={(e) => setOrganizerName(e.target.value)}
                placeholder="例: TARO EVENTS" className={inputClass} />
            </Field>
            <Field label="主催者用の画像" icon={<Camera size={11} className="text-pink-500" />} optional
              hint="主催者名義のチアで使われる画像（Walletカード等）。未設定なら基本のアバター画像を使用">
              <AvatarUploadField value={organizerAvatarUrl} onChange={setOrganizerAvatarUrl} placeholderLabel="主催者用の画像を選択" />
            </Field>
            <Field label="海外カード明細用の英字表記" icon={<Receipt size={11} className="text-pink-500" />} optional
              hint="海外発行カードの利用明細は主催者名の漢字部分が表示されないため、英字表記を個別に指定できます。未入力なら主催者名から自動生成">
              <input type="text" value={organizerNameAscii} onChange={(e) => setOrganizerNameAscii(e.target.value)}
                placeholder="例: TARO EVENTS" className={inputClass} />
            </Field>
            <StatementDescriptorPreview role="organizer" name={organizerName} nameAscii={organizerNameAscii} />
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

        {/* ── オーガナイザー / エージェント: アーティスト名（自身がDJとしても活動する場合） ── */}
        {(isOrganizer || isAgent) && (
          <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-6 space-y-5">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">DJとして出演する場合</p>
            <Field label="アーティスト名（DJ名）" icon={<Mic2 size={11} className="text-pink-500" />} optional
              hint="ラインナップや通知・Wallet・お客様のカード利用明細にも表示される名前。未入力なら表示名を使用">
              <input type="text" value={artistName} onChange={(e) => setArtistName(e.target.value)}
                placeholder="例: DJ TARO" className={inputClass} />
            </Field>
            <Field label="アーティスト用の画像" icon={<Camera size={11} className="text-pink-500" />} optional
              hint="演者名義のチアで使われる画像（Walletカード等）。未設定なら基本のアバター画像を使用">
              <AvatarUploadField value={artistAvatarUrl} onChange={setArtistAvatarUrl} placeholderLabel="演者用の画像を選択" />
            </Field>
            <Field label="海外カード明細用の英字表記" icon={<Receipt size={11} className="text-pink-500" />} optional
              hint="海外発行カードの利用明細はアーティスト名の漢字部分が表示されないため、英字表記を個別に指定できます。未入力ならアーティスト名から自動生成">
              <input type="text" value={artistNameAscii} onChange={(e) => setArtistNameAscii(e.target.value)}
                placeholder="例: DJ TARO" className={inputClass} />
            </Field>
            <StatementDescriptorPreview role="artist" name={artistName} nameAscii={artistNameAscii} />
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
                  <p className="text-[11px] text-slate-500 mt-0.5">Stripeに情報送信済み — オーナーによる口座開設審査待ち</p>
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

        {/* ── 署名済み利用規約同意書 ── */}
        {signedDoc && (
          <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-6 space-y-4">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] flex items-center gap-2">
              <FileText size={11} className="text-indigo-400" /> 利用規約同意書
            </p>
            <div className="flex items-center justify-between px-4 py-3 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl">
              <div>
                <p className="text-xs font-black text-indigo-300">調印済み文書</p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {new Date(signedDoc.signed_at).toLocaleDateString('ja-JP', { timeZone: DISPLAY_TZ, year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>
              <Link
                href={`/dashboard/documents/${signedDoc.id}`}
                className="text-[10px] font-black text-indigo-400 hover:text-indigo-300 uppercase tracking-widest transition-colors flex items-center gap-1"
              >
                確認する <ChevronRight size={12} />
              </Link>
            </div>
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
        {platform === 'ios' && (
          <>
            <p className="text-xs text-slate-500 leading-relaxed">
              アプリのようにすぐ起動できます。まずダッシュボードを開いてから、Safariで以下の手順で追加してください。
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
          </>
        )}
        {platform === 'android' && (
          <>
            <p className="text-xs text-slate-500 leading-relaxed">
              アプリのようにすぐ起動できます。
            </p>
            <PwaInstallButton />
          </>
        )}
        {platform === 'other' && (
          <p className="text-xs text-slate-500 leading-relaxed">
            スマートフォンのブラウザからアクセスすると、ホーム画面に追加してアプリのように使えます。
          </p>
        )}
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

      {/* 子機ログインQR */}
      <Link
        href="/dashboard/scanner-qr"
        className="flex items-center justify-between bg-slate-900 border border-slate-800 hover:border-pink-500/30 rounded-[2.5rem] p-6 transition-all group"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-800 rounded-2xl flex items-center justify-center group-hover:bg-pink-500/10 transition-colors">
            <Tablet size={18} className="text-slate-400 group-hover:text-pink-500 transition-colors" />
          </div>
          <div>
            <p className="text-sm font-black text-white">子機ログインQR</p>
            <p className="text-[11px] text-slate-500 mt-0.5">タブレット・子機端末にこのアカウントでログインさせる</p>
          </div>
        </div>
        <ArrowLeft size={16} className="text-slate-600 rotate-180 group-hover:text-pink-500 transition-colors" />
      </Link>

    </div>
    </>
  );
}
