'use client';

import { useEffect, useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import {
  User, Music, Globe, Camera,
  ArrowLeft, Loader2, Save, Mic2, CalendarDays, Shield, Smartphone, Share, Plus,
  ExternalLink, CheckCircle, Clock, AlertCircle, Building2, Tag, FileText, Layers,
  Phone, MapPin, CreditCard,
} from 'lucide-react';
import Link from 'next/link';

type Profile = {
  display_name: string;
  avatar_url: string | null;
  role: string;
  verification_status: string;
  pending_role: string | null;
  social_links: { instagram?: string; soundcloud?: string; website?: string };
  stripe_connect_id: string | null;
  // ロール別プロフィール
  bio: string | null;
  affiliation: string | null;
  credit_name: string | null;
  genre: string | null;
  organization_name: string | null;
  // Stripe 事前入力用
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  dob_year: number | null;
  dob_month: number | null;
  dob_day: number | null;
  postal_code: string | null;
  prefecture: string | null;
  city: string | null;
  street_address: string | null;
  business_type: 'individual' | 'company';
  business_name: string | null;
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

  // Stripe 事前入力
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [dobYear, setDobYear] = useState('');
  const [dobMonth, setDobMonth] = useState('');
  const [dobDay, setDobDay] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [prefecture, setPrefecture] = useState('');
  const [city, setCity] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [businessType, setBusinessType] = useState<'individual' | 'company'>('individual');
  const [businessName, setBusinessName] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [isConnecting, setIsConnecting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const fetchProfile = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/auth/login'); return; }

      // コア情報（role 確定に必須）を先に取得
      const { data: coreData } = await supabase
        .from('profiles')
        .select('display_name, avatar_url, role, verification_status, pending_role, social_links, stripe_connect_id')
        .eq('profile_id', user.id)
        .single();

      if (!coreData) { setIsLoading(false); return; }

      // 拡張フィールド（No.46 で追加。存在しない環境ではスキップ）
      const { data: extData } = await supabase
        .from('profiles')
        .select(`
          bio, affiliation, credit_name, genre, organization_name,
          first_name, last_name, phone,
          dob_year, dob_month, dob_day,
          postal_code, prefecture, city, street_address,
          business_type, business_name
        `)
        .eq('profile_id', user.id)
        .single();

      const data = { ...coreData, ...(extData ?? {}) } as Profile;

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
      setFirstName(data.first_name ?? '');
      setLastName(data.last_name ?? '');
      setPhone(data.phone ?? '');
      setDobYear(data.dob_year ? String(data.dob_year) : '');
      setDobMonth(data.dob_month ? String(data.dob_month) : '');
      setDobDay(data.dob_day ? String(data.dob_day) : '');
      setPostalCode(data.postal_code ?? '');
      setPrefecture(data.prefecture ?? '');
      setCity(data.city ?? '');
      setStreetAddress(data.street_address ?? '');
      setBusinessType((data.business_type as 'individual' | 'company') ?? 'individual');
      setBusinessName(data.business_name ?? '');

      setIsLoading(false);
    };
    fetchProfile();
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
        // Stripe 事前入力フィールド
        updates.first_name     = firstName.trim() || null;
        updates.last_name      = lastName.trim() || null;
        updates.phone          = phone.trim() || null;
        updates.dob_year       = dobYear ? Number(dobYear) : null;
        updates.dob_month      = dobMonth ? Number(dobMonth) : null;
        updates.dob_day        = dobDay ? Number(dobDay) : null;
        updates.postal_code    = postalCode.trim() || null;
        updates.prefecture     = prefecture.trim() || null;
        updates.city           = city.trim() || null;
        updates.street_address = streetAddress.trim() || null;
        updates.business_type  = businessType;
        updates.business_name  = businessType === 'company' ? (businessName.trim() || null) : null;
      }
      if (role === 'artist') {
        updates.affiliation  = affiliation.trim() || null;
        updates.credit_name  = creditName.trim() || null;
        updates.genre        = genre.trim() || null;
      }
      if (role === 'organizer' || role === 'agent') {
        updates.organization_name = organizationName.trim() || null;
      }

      const { error } = await supabase.from('profiles').update(updates).eq('profile_id', user.id);
      if (error) { toast.error('保存に失敗しました'); }
      else        { toast.success('プロファイルを更新しました'); }
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

  // Stripe ボタンを有効にするための必須チェック
  const stripeReady = !!(
    firstName.trim() && lastName.trim() && phone.trim() &&
    dobYear && dobMonth && dobDay &&
    postalCode.trim() && prefecture.trim() && city.trim() && streetAddress.trim() &&
    (businessType === 'individual' || businessName.trim())
  );
  const stripeConnected = !!profile?.stripe_connect_id;

  return (
    <div className="max-w-lg mx-auto space-y-8 pb-20">

      {/* ヘッダー */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard" className="w-10 h-10 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center text-slate-400 hover:text-white hover:border-slate-600 transition-all">
          <ArrowLeft size={18} />
        </Link>
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

          <Field label="表示名" icon={<User size={11} className="text-pink-500" />}>
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
              placeholder="名前またはニックネーム"
              className="w-full h-14 bg-slate-950/50 border border-slate-700 rounded-2xl px-5 text-sm text-white focus:border-pink-500 outline-none transition-all placeholder:text-slate-600 font-bold" />
          </Field>

          <Field label="アバター URL" icon={<Camera size={11} className="text-pink-500" />} optional>
            <div className="flex items-center gap-3">
              {avatarUrl && (
                <img src={avatarUrl} alt="avatar"
                  className="w-12 h-12 rounded-2xl object-cover border border-slate-700 shrink-0"
                  onError={(e) => (e.currentTarget.style.display = 'none')} />
              )}
              <input type="url" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://..."
                className="flex-1 h-14 bg-slate-950/50 border border-slate-700 rounded-2xl px-5 text-sm text-white focus:border-pink-500 outline-none transition-all placeholder:text-slate-600" />
            </div>
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
          <Field label="Website" icon={<Globe size={11} className="text-pink-500" />} optional>
            <input type="url" value={website} onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://yoursite.com" className={inputClass} />
          </Field>
        </div>

        {/* ── アーティスト専用 ── */}
        {isArtist && (
          <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-6 space-y-5">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">アーティスト情報</p>
            <Field label="クレジット表記" icon={<Tag size={11} className="text-pink-500" />} optional
              hint="フライヤーやレシートに表示される正式クレジット名">
              <input type="text" value={creditName} onChange={(e) => setCreditName(e.target.value)}
                placeholder="例: DJ TARO / Taro Yamamoto" className={inputClass} />
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

        {/* ── 口座登録に必要な本人情報（アーティスト以上） ── */}
        {isCreator && (
          <div className="bg-slate-900 border border-indigo-500/20 rounded-[2.5rem] p-6 space-y-5">
            <div className="space-y-1">
              <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] flex items-center gap-2">
                <CreditCard size={11} /> 口座登録に必要な本人情報
              </p>
              <p className="text-[10px] text-slate-500">Stripe Connect に必要な本人確認情報です。口座登録前に入力・保存してください。</p>
            </div>

            {/* ビジネス種別 */}
            <div className="space-y-2">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">種別 <span className="text-pink-500">*</span></p>
              <div className="grid grid-cols-2 gap-2">
                {(['individual', 'company'] as const).map((type) => (
                  <button key={type} type="button" onClick={() => setBusinessType(type)}
                    className={`h-11 rounded-xl text-xs font-black uppercase tracking-widest transition-all border ${
                      businessType === type
                        ? 'bg-indigo-500/20 border-indigo-500/50 text-white'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                    }`}>
                    {type === 'individual' ? '個人' : '法人 / 屋号'}
                  </button>
                ))}
              </div>
            </div>

            {/* 法人の場合: 屋号/会社名 */}
            {businessType === 'company' && (
              <Field label="屋号 / 会社名" icon={<Building2 size={11} className="text-indigo-400" />}>
                <input type="text" value={businessName} onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="例: 株式会社〇〇 / DJ事務所〇〇" className={inputClass} />
              </Field>
            )}

            {/* 姓名 */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="姓" icon={<User size={11} className="text-indigo-400" />}>
                <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)}
                  placeholder="山田" className={inputClass} />
              </Field>
              <Field label="名" icon={<User size={11} className="text-indigo-400" />}>
                <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)}
                  placeholder="太郎" className={inputClass} />
              </Field>
            </div>

            {/* 生年月日 */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
                生年月日 <span className="text-pink-500">*</span>
              </p>
              <div className="grid grid-cols-3 gap-2">
                <input type="number" value={dobYear} onChange={(e) => setDobYear(e.target.value)}
                  placeholder="1990" min={1900} max={2010}
                  className={inputClass + " text-center"} />
                <input type="number" value={dobMonth} onChange={(e) => setDobMonth(e.target.value)}
                  placeholder="月" min={1} max={12}
                  className={inputClass + " text-center"} />
                <input type="number" value={dobDay} onChange={(e) => setDobDay(e.target.value)}
                  placeholder="日" min={1} max={31}
                  className={inputClass + " text-center"} />
              </div>
              <p className="text-[10px] text-slate-600">年　　　　　月　　　　　日</p>
            </div>

            {/* 電話番号 */}
            <Field label="電話番号" icon={<Phone size={11} className="text-indigo-400" />}
              hint="ハイフンなし例: 09012345678">
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                placeholder="09012345678" className={inputClass} />
            </Field>

            {/* 住所 */}
            <div className="space-y-3">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
                <MapPin size={11} className="text-indigo-400" /> 住所 <span className="text-pink-500">*</span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-600">郵便番号（ハイフンなし）</p>
                  <input type="text" value={postalCode} onChange={(e) => setPostalCode(e.target.value)}
                    placeholder="1000001" maxLength={7} className={inputClass} />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-600">都道府県</p>
                  <input type="text" value={prefecture} onChange={(e) => setPrefecture(e.target.value)}
                    placeholder="東京都" className={inputClass} />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-slate-600">市区町村</p>
                <input type="text" value={city} onChange={(e) => setCity(e.target.value)}
                  placeholder="千代田区" className={inputClass} />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-slate-600">番地・建物名</p>
                <input type="text" value={streetAddress} onChange={(e) => setStreetAddress(e.target.value)}
                  placeholder="千代田1-1-1 〇〇ビル 101号室" className={inputClass} />
              </div>
            </div>
          </div>
        )}

        {/* ── Stripe Connect ── */}
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

            {(!stripeConnected || profile?.verification_status === 'unverified') && (
              <div className="space-y-4">
                <div className="space-y-2 text-xs text-slate-400">
                  {[
                    'Stripe本人確認・口座登録（このボタンから）',
                    'Stripe審査（数分〜数日）',
                    'プラットフォームオーナーによる口座開設審査',
                  ].map((step, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black border ${
                        i === 0 ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-400' : 'bg-slate-700 border-slate-600 text-slate-400'
                      }`}>{i + 1}</div>
                      <span>{step}</span>
                    </div>
                  ))}
                </div>

                {!stripeReady && (
                  <p className="text-[10px] text-amber-400 font-bold">
                    ↑「口座登録に必要な本人情報」をすべて入力してから保存してください
                  </p>
                )}

                <button
                  type="button"
                  disabled={isConnecting || !stripeReady}
                  onClick={async () => {
                    setIsConnecting(true);
                    try {
                      const res = await fetch('/api/stripe/connect/onboarding', { method: 'POST' });
                      const data = await res.json();
                      if (data.url) { window.location.href = data.url; }
                      else { toast.error(data.error ?? 'エラーが発生しました'); setIsConnecting(false); }
                    } catch {
                      toast.error('通信エラーが発生しました'); setIsConnecting(false);
                    }
                  }}
                  className="w-full h-12 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:brightness-110 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isConnecting ? <Loader2 size={16} className="animate-spin" /> : <><ExternalLink size={14} /> 口座登録・本人確認を始める</>}
                </button>
              </div>
            )}

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

    </div>
  );
}
