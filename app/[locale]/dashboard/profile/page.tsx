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
  first_name_kanji: string | null;
  last_name_kanji: string | null;
  first_name_kana: string | null;
  last_name_kana: string | null;
  phone: string | null;
  dob_year: number | null;
  dob_month: number | null;
  dob_day: number | null;
  postal_code: string | null;
  prefecture: string | null;
  city: string | null;
  address_town: string | null;
  street_address: string | null;
  address_kana_state: string | null;
  address_kana_city: string | null;
  address_kana_town: string | null;
  address_kana_line1: string | null;
  business_type: 'individual' | 'company';
  business_name: string | null;
  company_name_kanji: string | null;
  company_name_kana: string | null;
  product_description: string | null;
  statement_descriptor_kanji: string | null;
  statement_descriptor_kana: string | null;
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
  const [firstNameKanji, setFirstNameKanji] = useState('');
  const [lastNameKanji, setLastNameKanji] = useState('');
  const [firstNameKana, setFirstNameKana] = useState('');
  const [lastNameKana, setLastNameKana] = useState('');
  const [phone, setPhone] = useState('');
  const [dobYear, setDobYear] = useState('');
  const [dobMonth, setDobMonth] = useState('');
  const [dobDay, setDobDay] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [prefecture, setPrefecture] = useState('');
  const [city, setCity] = useState('');
  const [addressTown, setAddressTown] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [addressKanaState, setAddressKanaState] = useState('');
  const [addressKanaCity, setAddressKanaCity] = useState('');
  const [addressKanaTown, setAddressKanaTown] = useState('');
  const [addressKanaLine1, setAddressKanaLine1] = useState('');
  const [businessType, setBusinessType] = useState<'individual' | 'company'>('individual');
  const [businessName, setBusinessName] = useState('');
  const [companyNameKanji, setCompanyNameKanji] = useState('');
  const [companyNameKana, setCompanyNameKana] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [statementDescriptorKanji, setStatementDescriptorKanji] = useState('');
  const [statementDescriptorKana, setStatementDescriptorKana] = useState('');

  const [zipSearching, setZipSearching] = useState(false);

  const toFullWidthKana = (str: string): string => {
    const map: Record<string, string> = {
      'ｦ':'ヲ','ｧ':'ァ','ｨ':'ィ','ｩ':'ゥ','ｪ':'ェ','ｫ':'ォ','ｬ':'ャ','ｭ':'ュ','ｮ':'ョ','ｯ':'ッ','ｰ':'ー',
      'ｱ':'ア','ｲ':'イ','ｳ':'ウ','ｴ':'エ','ｵ':'オ','ｶ':'カ','ｷ':'キ','ｸ':'ク','ｹ':'ケ','ｺ':'コ',
      'ｻ':'サ','ｼ':'シ','ｽ':'ス','ｾ':'セ','ｿ':'ソ','ﾀ':'タ','ﾁ':'チ','ﾂ':'ツ','ﾃ':'テ','ﾄ':'ト',
      'ﾅ':'ナ','ﾆ':'ニ','ﾇ':'ヌ','ﾈ':'ネ','ﾉ':'ノ','ﾊ':'ハ','ﾋ':'ヒ','ﾌ':'フ','ﾍ':'ヘ','ﾎ':'ホ',
      'ﾏ':'マ','ﾐ':'ミ','ﾑ':'ム','ﾒ':'メ','ﾓ':'モ','ﾔ':'ヤ','ﾕ':'ユ','ﾖ':'ヨ',
      'ﾗ':'ラ','ﾘ':'リ','ﾙ':'ル','ﾚ':'レ','ﾛ':'ロ','ﾜ':'ワ','ﾝ':'ン',
    };
    return str.replace(/[ｦ-ﾟ]/g, c => map[c] ?? c);
  };

  const searchZip = async (zip: string) => {
    const digits = zip.replace(/\D/g, '');
    if (digits.length !== 7) return;
    setZipSearching(true);
    try {
      const res = await fetch(`/api/zip-search?zipcode=${digits}`);
      const json = await res.json();
      console.log('[zip-search] response:', JSON.stringify(json));
      if (!res.ok) { toast.error(`住所検索エラー: ${json.error ?? res.status}`); return; }
      const r = json.results?.[0];
      if (!r) { toast.error('該当する住所が見つかりませんでした'); return; }
      console.log('[zip-search] kana raw:', r.kana1, r.kana2, r.kana3);
      setPrefecture(r.address1 ?? '');
      setCity(r.address2 ?? '');
      setAddressTown(r.address3 ?? '');
      setAddressKanaState(toFullWidthKana(r.kana1 ?? ''));
      setAddressKanaCity(toFullWidthKana(r.kana2 ?? ''));
      setAddressKanaTown(toFullWidthKana(r.kana3 ?? ''));
    } catch (err) {
      console.error('[zip-search] error:', err);
      toast.error('住所検索に失敗しました');
    } finally {
      setZipSearching(false);
    }
  };

  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [isConnecting, setIsConnecting] = useState(false);
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
    setFirstName(data.first_name ?? '');
    setLastName(data.last_name ?? '');
    setFirstNameKanji(data.first_name_kanji ?? '');
    setLastNameKanji(data.last_name_kanji ?? '');
    setFirstNameKana(data.first_name_kana ?? '');
    setLastNameKana(data.last_name_kana ?? '');
    setPhone(data.phone ?? '');
    setDobYear(data.dob_year ? String(data.dob_year) : '');
    setDobMonth(data.dob_month ? String(data.dob_month) : '');
    setDobDay(data.dob_day ? String(data.dob_day) : '');
    setPostalCode(data.postal_code ?? '');
    setPrefecture(data.prefecture ?? '');
    setCity(data.city ?? '');
    setAddressTown(data.address_town ?? '');
    setStreetAddress(data.street_address ?? '');
    setAddressKanaState(data.address_kana_state ?? '');
    setAddressKanaCity(data.address_kana_city ?? '');
    setAddressKanaTown(data.address_kana_town ?? '');
    setAddressKanaLine1(data.address_kana_line1 ?? '');
    setBusinessType((data.business_type as 'individual' | 'company') ?? 'individual');
    setBusinessName(data.business_name ?? '');
    setCompanyNameKanji(data.company_name_kanji ?? '');
    setCompanyNameKana(data.company_name_kana ?? '');
    setProductDescription(data.product_description ?? '');
    setStatementDescriptorKanji(data.statement_descriptor_kanji ?? '');
    setStatementDescriptorKana(data.statement_descriptor_kana ?? '');
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
      .select(`
        bio, affiliation, credit_name, genre, organization_name,
        first_name, last_name,
        first_name_kanji, last_name_kanji,
        first_name_kana, last_name_kana,
        phone, dob_year, dob_month, dob_day,
        postal_code, prefecture, city, address_town, street_address,
        address_kana_state, address_kana_city, address_kana_town, address_kana_line1,
        business_type, business_name, company_name_kanji, company_name_kana,
        product_description, statement_descriptor_kanji, statement_descriptor_kana
      `)
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
        // Stripe 事前入力フィールド
        updates.first_name               = firstName.trim() || null;
        updates.last_name                = lastName.trim() || null;
        updates.first_name_kanji         = firstNameKanji.trim() || null;
        updates.last_name_kanji          = lastNameKanji.trim() || null;
        updates.first_name_kana          = firstNameKana.trim() || null;
        updates.last_name_kana           = lastNameKana.trim() || null;
        updates.phone                    = phone.trim() || null;
        updates.dob_year                 = dobYear ? Number(dobYear) : null;
        updates.dob_month                = dobMonth ? Number(dobMonth) : null;
        updates.dob_day                  = dobDay ? Number(dobDay) : null;
        updates.postal_code              = postalCode.trim() || null;
        updates.prefecture               = prefecture.trim() || null;
        updates.city                     = city.trim() || null;
        updates.address_town             = addressTown.trim() || null;
        updates.street_address           = streetAddress.trim() || null;
        updates.address_kana_state       = addressKanaState.trim() || null;
        updates.address_kana_city        = addressKanaCity.trim() || null;
        updates.address_kana_town        = addressKanaTown.trim() || null;
        updates.address_kana_line1       = addressKanaLine1.trim() || null;
        updates.business_type            = businessType;
        updates.business_name            = businessType === 'company' ? (businessName.trim() || null) : null;
        updates.company_name_kanji       = businessType === 'company' ? (companyNameKanji.trim() || null) : null;
        updates.company_name_kana        = businessType === 'company' ? (companyNameKana.trim() || null) : null;
        updates.product_description      = productDescription.trim() || null;
        updates.statement_descriptor_kanji = statementDescriptorKanji.trim() || null;
        updates.statement_descriptor_kana  = statementDescriptorKana.trim() || null;
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
      if (error) {
        toast.error('保存に失敗しました');
      } else {
        // DB から再フェッチして profile state を確実に同期（stripeReady 再評価）
        await fetchAndApplyProfile(supabase, user.id);
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

  const stripeReady = !!(
    firstName.trim() && lastName.trim() &&
    firstNameKanji.trim() && lastNameKanji.trim() &&
    firstNameKana.trim() && lastNameKana.trim() &&
    phone.trim() &&
    dobYear && dobMonth && dobDay &&
    postalCode.trim() && prefecture.trim() &&
    city.trim() && addressTown.trim() && streetAddress.trim() &&
    (businessType === 'individual' || (businessName.trim() && companyNameKanji.trim() && companyNameKana.trim())) &&
    productDescription.trim() &&
    website.trim()
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
              <div className="space-y-3">
                <Field label="屋号 / 会社名（漢字）" icon={<Building2 size={11} className="text-indigo-400" />}>
                  <input type="text" value={businessName} onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="例: 株式会社〇〇" className={inputClass} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="会社名（カナ）" icon={<Building2 size={11} className="text-indigo-400" />}>
                    <input type="text" value={companyNameKana} onChange={(e) => setCompanyNameKana(e.target.value)}
                      placeholder="カブシキガイシャ〇〇" className={inputClass} />
                  </Field>
                  <Field label="会社名（ローマ字）" icon={<Building2 size={11} className="text-indigo-400" />}>
                    <input type="text" value={companyNameKanji} onChange={(e) => setCompanyNameKanji(e.target.value)}
                      placeholder="Kabushiki Gaisha XX" className={inputClass} />
                  </Field>
                </div>
              </div>
            )}

            {/* 姓名（ローマ字） */}
            <div className="space-y-2">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">氏名（ローマ字）<span className="text-pink-500">*</span></p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-600">姓 (Last)</p>
                  <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)}
                    placeholder="Yamada" className={inputClass} />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-600">名 (First)</p>
                  <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Taro" className={inputClass} />
                </div>
              </div>
            </div>

            {/* 姓名（漢字） */}
            <div className="space-y-2">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">氏名（漢字）<span className="text-pink-500">*</span></p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-600">姓</p>
                  <input type="text" value={lastNameKanji} onChange={(e) => setLastNameKanji(e.target.value)}
                    placeholder="山田" className={inputClass} />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-600">名</p>
                  <input type="text" value={firstNameKanji} onChange={(e) => setFirstNameKanji(e.target.value)}
                    placeholder="太郎" className={inputClass} />
                </div>
              </div>
            </div>

            {/* 姓名（フリガナ） */}
            <div className="space-y-2">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">氏名（フリガナ）<span className="text-pink-500">*</span></p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-600">セイ</p>
                  <input type="text" value={lastNameKana} onChange={(e) => setLastNameKana(e.target.value)}
                    placeholder="ヤマダ" className={inputClass} />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-600">メイ</p>
                  <input type="text" value={firstNameKana} onChange={(e) => setFirstNameKana(e.target.value)}
                    placeholder="タロウ" className={inputClass} />
                </div>
              </div>
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

              {/* 郵便番号 + 検索 */}
              <div className="space-y-1">
                <p className="text-[10px] text-slate-600">郵便番号（ハイフンなし）</p>
                <div className="flex gap-2">
                  <input type="text" value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    onBlur={(e) => searchZip(e.target.value)}
                    placeholder="1000001" maxLength={7}
                    className={inputClass + " flex-1"} />
                  <button type="button" onClick={() => searchZip(postalCode)}
                    disabled={zipSearching}
                    className="h-12 px-4 bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 text-xs font-black rounded-xl hover:bg-indigo-500/30 transition-all disabled:opacity-50 shrink-0">
                    {zipSearching ? <Loader2 size={14} className="animate-spin" /> : '検索'}
                  </button>
                </div>
              </div>

              {/* 漢字住所（検索で自動入力） */}
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-600">都道府県</p>
                  <input type="text" value={prefecture} onChange={(e) => setPrefecture(e.target.value)}
                    placeholder="東京都" className={inputClass} />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-600">市区</p>
                  <input type="text" value={city} onChange={(e) => setCity(e.target.value)}
                    placeholder="千代田区" className={inputClass} />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-600">町域・丁目</p>
                  <input type="text" value={addressTown} onChange={(e) => setAddressTown(e.target.value)}
                    placeholder="千代田1丁目" className={inputClass} />
                </div>
              </div>

              {/* カナ住所（検索で自動入力） */}
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-600">都道府県（カナ）</p>
                  <input type="text" value={addressKanaState} onChange={(e) => setAddressKanaState(e.target.value)}
                    placeholder="トウキョウト" className={inputClass} />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-600">市区（カナ）</p>
                  <input type="text" value={addressKanaCity} onChange={(e) => setAddressKanaCity(e.target.value)}
                    placeholder="チヨダク" className={inputClass} />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-600">町域（カナ）</p>
                  <input type="text" value={addressKanaTown} onChange={(e) => setAddressKanaTown(e.target.value)}
                    placeholder="チヨダ" className={inputClass} />
                </div>
              </div>

              {/* 番地・建物名（手動入力） */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-600">番地・建物名</p>
                  <input type="text" value={streetAddress} onChange={(e) => setStreetAddress(e.target.value)}
                    placeholder="1-1 〇〇ビル 101号室" className={inputClass} />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-600">番地・建物名（カナ）</p>
                  <input type="text" value={addressKanaLine1} onChange={(e) => setAddressKanaLine1(e.target.value)}
                    placeholder="1-1 〇〇ビル 101" className={inputClass} />
                </div>
              </div>
              <p className="text-[10px] text-slate-600">郵便番号を入力すると都道府県〜町域を自動入力します</p>
            </div>

            {/* 事業内容 */}
            <Field label="事業内容" icon={<FileText size={11} className="text-indigo-400" />}
              hint="Stripeに登録する事業・活動の説明（例: DJ・音楽パフォーマンスサービス）">
              <textarea value={productDescription} onChange={(e) => setProductDescription(e.target.value)} rows={3}
                placeholder="例: DJ・音楽パフォーマンスサービス / ライブイベント主催・企画" className={textareaClass} />
            </Field>

            {/* カード明細表示名 */}
            <div className="space-y-3">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
                カード明細表示名 <span className="text-slate-600 normal-case font-normal">（任意）</span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-600">漢字（最大22文字）</p>
                  <input type="text" value={statementDescriptorKanji} onChange={(e) => setStatementDescriptorKanji(e.target.value)}
                    placeholder="例: ダイレクトチアーズ" maxLength={22} className={inputClass} />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-600">カナ（最大22文字）</p>
                  <input type="text" value={statementDescriptorKana} onChange={(e) => setStatementDescriptorKana(e.target.value)}
                    placeholder="例: ダイレクトチアーズ" maxLength={22} className={inputClass} />
                </div>
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
                    ↑「口座登録に必要な本人情報」をすべて入力し、「保存する」ボタンを押してから進んでください
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
              <div className="space-y-3">
                <div className="flex items-center gap-3 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-2xl">
                  <AlertCircle size={16} className="text-red-400 shrink-0" />
                  <div>
                    <p className="text-sm text-red-400 font-black">審査却下</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {inviter ? `担当エージェント（${inviter.display_name ?? '—'}）にご確認ください` : 'エージェントにお問い合わせください'}
                    </p>
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
                      if (data.url) { window.location.href = data.url; }
                      else { toast.error(data.error ?? 'エラーが発生しました'); setIsConnecting(false); }
                    } catch {
                      toast.error('通信エラーが発生しました'); setIsConnecting(false);
                    }
                  }}
                  className="w-full h-12 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:brightness-110 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isConnecting ? <Loader2 size={16} className="animate-spin" /> : <><ExternalLink size={14} /> 再申請する</>}
                </button>
              </div>
            )}

            {inviter && profile?.verification_status !== 'rejected' && (
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
  );
}
