'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  ArrowLeft, ArrowRight, Loader2, ExternalLink, Building2,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

type BusinessType = 'individual' | 'company';

type Form = {
  businessType: BusinessType;
  lastName: string;
  firstName: string;
  lastNameKanji: string;
  firstNameKanji: string;
  lastNameKana: string;
  firstNameKana: string;
  businessName: string;
  companyNameKanji: string;
  companyNameKana: string;
  dobYear: string;
  dobMonth: string;
  dobDay: string;
  phone: string;
  postalCode: string;
  prefecture: string;
  city: string;
  addressTown: string;
  streetAddress: string;
  addressKanaState: string;
  addressKanaCity: string;
  addressKanaTown: string;
  addressKanaLine1: string;
  productDescription: string;
  website: string;
};

const empty: Form = {
  businessType: 'individual',
  lastName: '', firstName: '',
  lastNameKanji: '', firstNameKanji: '',
  lastNameKana: '', firstNameKana: '',
  businessName: '', companyNameKanji: '', companyNameKana: '',
  dobYear: '', dobMonth: '', dobDay: '',
  phone: '',
  postalCode: '', prefecture: '', city: '', addressTown: '', streetAddress: '',
  addressKanaState: '', addressKanaCity: '', addressKanaTown: '', addressKanaLine1: '',
  productDescription: '', website: '',
};

const STEP_LABELS = ['種別選択', '氏名', '生年月日・電話', '住所', '事業情報'];

const ic = "w-full h-12 bg-slate-950/50 border border-slate-800 rounded-xl px-5 text-sm text-white focus:border-indigo-500/50 outline-none transition-all placeholder:text-slate-700";
const ta = "w-full bg-slate-950/50 border border-slate-800 rounded-xl px-5 py-3 text-sm text-white focus:border-indigo-500/50 outline-none transition-all placeholder:text-slate-700 resize-none";

function toFullWidthKana(str: string): string {
  const map: Record<string, string> = {
    'ｦ':'ヲ','ｧ':'ァ','ｨ':'ィ','ｩ':'ゥ','ｪ':'ェ','ｫ':'ォ','ｬ':'ャ','ｭ':'ュ','ｮ':'ョ','ｯ':'ッ','ｰ':'ー',
    'ｱ':'ア','ｲ':'イ','ｳ':'ウ','ｴ':'エ','ｵ':'オ','ｶ':'カ','ｷ':'キ','ｸ':'ク','ｹ':'ケ','ｺ':'コ',
    'ｻ':'サ','ｼ':'シ','ｽ':'ス','ｾ':'セ','ｿ':'ソ','ﾀ':'タ','ﾁ':'チ','ﾂ':'ツ','ﾃ':'テ','ﾄ':'ト',
    'ﾅ':'ナ','ﾆ':'ニ','ﾇ':'ヌ','ﾈ':'ネ','ﾉ':'ノ','ﾊ':'ハ','ﾋ':'ヒ','ﾌ':'フ','ﾍ':'ヘ','ﾎ':'ホ',
    'ﾏ':'マ','ﾐ':'ミ','ﾑ':'ム','ﾒ':'メ','ﾓ':'モ','ﾔ':'ヤ','ﾕ':'ユ','ﾖ':'ヨ',
    'ﾗ':'ラ','ﾘ':'リ','ﾙ':'ル','ﾚ':'レ','ﾛ':'ロ','ﾜ':'ワ','ﾝ':'ン',
  };
  return str.replace(/[ｦ-ﾟ]/g, c => map[c] ?? c);
}

export default function BankSetupPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<Form>(empty);
  const [loading, setLoading] = useState(true);
  const [zipSearching, setZipSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const set = <K extends keyof Form>(key: K) => (value: Form[K]) =>
    setForm(f => ({ ...f, [key]: value }));
  const setStr = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }));

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/auth/login'); return; }

      // artistのみ規約同意をbank-setup前にチェック
      // organizer/agentはbank-setup → 面談 → admin承認の順なのでここではチェックしない
      const termsRes = await fetch('/api/terms/status');
      if (termsRes.ok) {
        const termsData = await termsRes.json();
        if (termsData.role === 'artist' && !termsData.allAgreed) {
          router.replace('/dashboard/terms?next=/dashboard/profile/bank-setup');
          return;
        }
      }

      const { data } = await supabase
        .from('profiles')
        .select(`
          business_type, social_links,
          last_name, first_name, last_name_kanji, first_name_kanji, last_name_kana, first_name_kana,
          business_name, company_name_kanji, company_name_kana,
          dob_year, dob_month, dob_day, phone,
          postal_code, prefecture, city, address_town, street_address,
          address_kana_state, address_kana_city, address_kana_town, address_kana_line1,
          product_description
        `)
        .eq('profile_id', user.id)
        .single();

      if (data) {
        setForm({
          businessType: (data.business_type as BusinessType) ?? 'individual',
          lastName: data.last_name ?? '',
          firstName: data.first_name ?? '',
          lastNameKanji: data.last_name_kanji ?? '',
          firstNameKanji: data.first_name_kanji ?? '',
          lastNameKana: data.last_name_kana ?? '',
          firstNameKana: data.first_name_kana ?? '',
          businessName: data.business_name ?? '',
          companyNameKanji: data.company_name_kanji ?? '',
          companyNameKana: data.company_name_kana ?? '',
          dobYear: data.dob_year ? String(data.dob_year) : '',
          dobMonth: data.dob_month ? String(data.dob_month) : '',
          dobDay: data.dob_day ? String(data.dob_day) : '',
          phone: data.phone ?? '',
          postalCode: data.postal_code ?? '',
          prefecture: data.prefecture ?? '',
          city: data.city ?? '',
          addressTown: data.address_town ?? '',
          streetAddress: data.street_address ?? '',
          addressKanaState: data.address_kana_state ?? '',
          addressKanaCity: data.address_kana_city ?? '',
          addressKanaTown: data.address_kana_town ?? '',
          addressKanaLine1: data.address_kana_line1 ?? '',
          productDescription: data.product_description ?? '',
          website: (data.social_links as Record<string, string> | null)?.website ?? '',
        });
      }
      setLoading(false);
    })();
  }, [router]);

  const searchZip = async (zip: string) => {
    const digits = zip.replace(/\D/g, '');
    if (digits.length !== 7) return;
    setZipSearching(true);
    try {
      const res = await fetch(`/api/zip-search?zipcode=${digits}`);
      const json = await res.json();
      if (!res.ok) { toast.error('住所検索エラー'); return; }
      const r = json.results?.[0];
      if (!r) { toast.error('該当する住所が見つかりませんでした'); return; }
      setForm(f => ({
        ...f,
        prefecture: r.address1 ?? '',
        city: r.address2 ?? '',
        addressTown: r.address3 ?? '',
        addressKanaState: toFullWidthKana(r.kana1 ?? ''),
        addressKanaCity: toFullWidthKana(r.kana2 ?? ''),
        addressKanaTown: toFullWidthKana(r.kana3 ?? ''),
      }));
    } catch {
      toast.error('住所検索に失敗しました');
    } finally {
      setZipSearching(false);
    }
  };

  const validate = (): string | null => {
    if (step === 2) {
      if (!form.lastName.trim() || !form.firstName.trim()) return '氏名（ローマ字）を入力してください';
      if (!form.lastNameKanji.trim() || !form.firstNameKanji.trim()) return '氏名（漢字）を入力してください';
      if (!form.lastNameKana.trim() || !form.firstNameKana.trim()) return '氏名（フリガナ）を入力してください';
      if (form.businessType === 'company') {
        if (!form.businessName.trim()) return '屋号 / 会社名を入力してください';
        if (!form.companyNameKanji.trim()) return '会社名（ローマ字）を入力してください';
        if (!form.companyNameKana.trim()) return '会社名（カナ）を入力してください';
      }
    }
    if (step === 3) {
      if (!form.dobYear || !form.dobMonth || !form.dobDay) return '生年月日を入力してください';
      if (!form.phone.trim()) return '電話番号を入力してください';
    }
    if (step === 4) {
      if (!form.postalCode.trim()) return '郵便番号を入力してください';
      if (!form.prefecture.trim() || !form.city.trim() || !form.addressTown.trim() || !form.streetAddress.trim())
        return '住所（漢字）をすべて入力してください';
      if (!form.addressKanaState.trim() || !form.addressKanaCity.trim() || !form.addressKanaTown.trim())
        return '住所（フリガナ）をすべて入力してください';
    }
    if (step === 5) {
      if (!form.productDescription.trim()) return '事業内容を入力してください';
      if (!form.website.trim()) return 'WebサイトURLを入力してください';
    }
    return null;
  };

  const handleNext = async () => {
    const err = validate();
    if (err) { toast.error(err); return; }

    if (step < 5) {
      setStep(s => s + 1);
      window.scrollTo({ top: 0 });
      return;
    }

    setSubmitting(true);
    try {
      // フォームデータをonboardingに直接渡す（別途PATCHを送らない）
      // onboarding側でDB保存とStripe処理を並列実行する
      const stripeRes = await fetch('/api/stripe/connect/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_type:               form.businessType,
          last_name:                   form.lastName.trim()                 || null,
          first_name:                  form.firstName.trim()                || null,
          last_name_kanji:             form.lastNameKanji.trim()            || null,
          first_name_kanji:            form.firstNameKanji.trim()           || null,
          last_name_kana:              form.lastNameKana.trim()             || null,
          first_name_kana:             form.firstNameKana.trim()            || null,
          business_name:               form.businessType === 'company' ? (form.businessName.trim()      || null) : null,
          company_name_kanji:          form.businessType === 'company' ? (form.companyNameKanji.trim()  || null) : null,
          company_name_kana:           form.businessType === 'company' ? (form.companyNameKana.trim()   || null) : null,
          dob_year:                    form.dobYear  ? Number(form.dobYear)  : null,
          dob_month:                   form.dobMonth ? Number(form.dobMonth) : null,
          dob_day:                     form.dobDay   ? Number(form.dobDay)   : null,
          phone:                       form.phone.trim()                    || null,
          postal_code:                 form.postalCode.trim()               || null,
          prefecture:                  form.prefecture.trim()               || null,
          city:                        form.city.trim()                     || null,
          address_town:                form.addressTown.trim()              || null,
          street_address:              form.streetAddress.trim()            || null,
          address_kana_state:          form.addressKanaState.trim()         || null,
          address_kana_city:           form.addressKanaCity.trim()          || null,
          address_kana_town:           form.addressKanaTown.trim()          || null,
          address_kana_line1:          form.addressKanaLine1.trim()         || null,
          product_description:         form.productDescription.trim()       || null,
          website:                     form.website.trim()                  || null,
        }),
      });
      const stripeData = await stripeRes.json();
      if (stripeData.url) {
        window.location.href = stripeData.url;
      } else {
        toast.error(stripeData.error ?? 'Stripeへの接続に失敗しました');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-slate-600" size={32} />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6 pb-20">

      {/* ヘッダー */}
      <div className="flex items-center gap-3">
        {step > 1 ? (
          <button
            onClick={() => { setStep(s => s - 1); window.scrollTo({ top: 0 }); }}
            className="w-10 h-10 bg-slate-800 rounded-2xl flex items-center justify-center text-slate-400 hover:text-white transition-colors shrink-0"
          >
            <ArrowLeft size={16} />
          </button>
        ) : (
          <Link
            href="/dashboard/profile"
            className="w-10 h-10 bg-slate-800 rounded-2xl flex items-center justify-center text-slate-400 hover:text-white transition-colors shrink-0"
          >
            <ArrowLeft size={16} />
          </Link>
        )}
        <div>
          <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em]">Bank Setup</p>
          <h1 className="text-2xl font-black text-white italic uppercase tracking-tighter">売上受取口座</h1>
        </div>
      </div>

      {/* プログレス */}
      <div className="space-y-2">
        <div className="flex gap-1.5">
          {STEP_LABELS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-all duration-300 ${i < step ? 'bg-indigo-500' : 'bg-slate-800'}`}
            />
          ))}
        </div>
        <p className="text-[10px] text-slate-500">
          Step {step} / {STEP_LABELS.length} — {STEP_LABELS[step - 1]}
        </p>
      </div>

      {/* ── Step 1: 種別 ── */}
      {step === 1 && (
        <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-6 space-y-5">
          <div className="space-y-1">
            <p className="text-base font-black text-white">登録種別を選択してください</p>
            <p className="text-[11px] text-slate-500">Stripeへの登録種別です。後から変更できません。</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(['individual', 'company'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => set('businessType')(type)}
                className={`h-24 rounded-2xl text-sm font-black tracking-wider transition-all border flex flex-col items-center justify-center gap-2 ${
                  form.businessType === type
                    ? 'bg-indigo-500/20 border-indigo-500/50 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                }`}
              >
                <Building2 size={22} />
                {type === 'individual' ? '個人' : '法人 / 屋号'}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            DJや音楽アーティストとして活動している場合は「個人」を選択してください。
            事務所・レーベル名義での登録は「法人 / 屋号」を選択してください。
          </p>
        </div>
      )}

      {/* ── Step 2: 氏名 ── */}
      {step === 2 && (
        <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-6 space-y-6">

          {form.businessType === 'company' && (
            <div className="space-y-3">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
                屋号 / 会社名 <span className="text-pink-500">*</span>
              </p>
              <input type="text" value={form.businessName} onChange={setStr('businessName')}
                placeholder="例: 株式会社〇〇 / DJ事務所〇〇" className={ic} />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-600">カナ</p>
                  <input type="text" value={form.companyNameKana} onChange={setStr('companyNameKana')}
                    placeholder="カブシキガイシャ〇〇" className={ic} />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-600">ローマ字</p>
                  <input type="text" value={form.companyNameKanji} onChange={setStr('companyNameKanji')}
                    placeholder="Kabushiki Gaisha XX" className={ic} />
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
              {form.businessType === 'company' ? '代表者氏名' : '氏名'}（ローマ字）<span className="text-pink-500">*</span>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-[10px] text-slate-600">姓 (Last)</p>
                <input type="text" value={form.lastName} onChange={setStr('lastName')}
                  placeholder="Yamada" className={ic} />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-slate-600">名 (First)</p>
                <input type="text" value={form.firstName} onChange={setStr('firstName')}
                  placeholder="Taro" className={ic} />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
              氏名（漢字）<span className="text-pink-500">*</span>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-[10px] text-slate-600">姓</p>
                <input type="text" value={form.lastNameKanji} onChange={setStr('lastNameKanji')}
                  placeholder="山田" className={ic} />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-slate-600">名</p>
                <input type="text" value={form.firstNameKanji} onChange={setStr('firstNameKanji')}
                  placeholder="太郎" className={ic} />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
              氏名（フリガナ）<span className="text-pink-500">*</span>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-[10px] text-slate-600">セイ</p>
                <input type="text" value={form.lastNameKana} onChange={setStr('lastNameKana')}
                  placeholder="ヤマダ" className={ic} />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-slate-600">メイ</p>
                <input type="text" value={form.firstNameKana} onChange={setStr('firstNameKana')}
                  placeholder="タロウ" className={ic} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 3: 生年月日・電話 ── */}
      {step === 3 && (
        <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-6 space-y-6">
          <div className="space-y-2">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
              生年月日 <span className="text-pink-500">*</span>
            </p>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <p className="text-[10px] text-slate-600">年</p>
                <input type="number" value={form.dobYear} onChange={setStr('dobYear')}
                  placeholder="1990" min={1900} max={2010} className={ic + " text-center"} />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-slate-600">月</p>
                <input type="number" value={form.dobMonth} onChange={setStr('dobMonth')}
                  placeholder="4" min={1} max={12} className={ic + " text-center"} />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-slate-600">日</p>
                <input type="number" value={form.dobDay} onChange={setStr('dobDay')}
                  placeholder="1" min={1} max={31} className={ic + " text-center"} />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
              電話番号 <span className="text-pink-500">*</span>
            </p>
            <input type="tel" value={form.phone} onChange={setStr('phone')}
              placeholder="09012345678" className={ic} />
            <p className="text-[10px] text-slate-600">ハイフンなし（例: 09012345678）</p>
          </div>
        </div>
      )}

      {/* ── Step 4: 住所 ── */}
      {step === 4 && (
        <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-6 space-y-5">

          {/* 郵便番号 */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
              郵便番号 <span className="text-pink-500">*</span>
            </p>
            <div className="flex gap-2">
              <input
                type="text" value={form.postalCode}
                onChange={setStr('postalCode')}
                onBlur={e => searchZip(e.target.value)}
                placeholder="1000001" maxLength={7}
                className={ic + " flex-1"}
              />
              <button
                type="button"
                onClick={() => searchZip(form.postalCode)}
                disabled={zipSearching}
                className="h-12 px-4 bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 text-xs font-black rounded-xl hover:bg-indigo-500/30 transition-all disabled:opacity-50 shrink-0"
              >
                {zipSearching ? <Loader2 size={14} className="animate-spin" /> : '検索'}
              </button>
            </div>
            <p className="text-[10px] text-slate-600">7桁を入力すると都道府県〜町域を自動入力します</p>
          </div>

          {/* 漢字住所 */}
          <div className="space-y-2">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
              住所（漢字）<span className="text-pink-500">*</span>
            </p>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <p className="text-[10px] text-slate-600">都道府県</p>
                <input type="text" value={form.prefecture} onChange={setStr('prefecture')}
                  placeholder="東京都" className={ic} />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-slate-600">市区</p>
                <input type="text" value={form.city} onChange={setStr('city')}
                  placeholder="千代田区" className={ic} />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-slate-600">町域・丁目</p>
                <input type="text" value={form.addressTown} onChange={setStr('addressTown')}
                  placeholder="千代田1丁目" className={ic} />
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-slate-600">番地・建物名</p>
              <input type="text" value={form.streetAddress} onChange={setStr('streetAddress')}
                placeholder="1-1 〇〇ビル 101号室" className={ic} />
            </div>
          </div>

          {/* カナ住所 */}
          <div className="space-y-2">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
              住所（フリガナ）<span className="text-pink-500">*</span>
            </p>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <p className="text-[10px] text-slate-600">都道府県</p>
                <input type="text" value={form.addressKanaState} onChange={setStr('addressKanaState')}
                  placeholder="トウキョウト" className={ic} />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-slate-600">市区</p>
                <input type="text" value={form.addressKanaCity} onChange={setStr('addressKanaCity')}
                  placeholder="チヨダク" className={ic} />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-slate-600">町域</p>
                <input type="text" value={form.addressKanaTown} onChange={setStr('addressKanaTown')}
                  placeholder="チヨダ" className={ic} />
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-slate-600">番地・建物名（カナ）</p>
              <input type="text" value={form.addressKanaLine1} onChange={setStr('addressKanaLine1')}
                placeholder="1-1 〇〇ビル 101" className={ic} />
            </div>
          </div>
        </div>
      )}

      {/* ── Step 5: 事業情報 ── */}
      {step === 5 && (
        <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-6 space-y-5">

          <div className="space-y-1.5">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
              事業内容 <span className="text-pink-500">*</span>
            </p>
            <textarea value={form.productDescription} onChange={setStr('productDescription')} rows={3}
              placeholder="例: DJ・音楽パフォーマンスサービス / ライブイベント主催・企画" className={ta} />
            <p className="text-[10px] text-slate-600">Stripeに登録する活動内容の説明</p>
          </div>

          <div className="space-y-1.5">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
              Webサイト / SNS <span className="text-pink-500">*</span>
            </p>
            <input type="url" value={form.website} onChange={setStr('website')}
              placeholder="https://yoursite.com" className={ic} />
            <p className="text-[10px] text-slate-600">InstagramなどSNSページでも可。Stripeの審査に使用されます</p>
          </div>

          <div className="p-3 bg-slate-950/50 border border-slate-800 rounded-xl space-y-1">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">カード利用明細表示</p>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              先頭の「DC」は不正な明細表記によるチャージバックを防ぐためシステムが固定しています（カスタマイズ不可）。
              その後ろには、決済の宛先に応じて主催者名または演者名（プロフィール画面で設定）が自動で追加されます。
            </p>
          </div>

          <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl space-y-1.5">
            <p className="text-xs font-black text-indigo-300">次のステップ</p>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              ボタンを押すと情報を保存し、Stripeの本人確認・銀行口座登録画面に移動します。
              Stripe側の手続きが完了すると、このサービスに自動で戻ってきます。
            </p>
          </div>
        </div>
      )}

      {/* ナビゲーションボタン */}
      <button
        type="button"
        onClick={handleNext}
        disabled={submitting}
        className="w-full h-14 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:brightness-110 text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {submitting ? (
          <Loader2 size={18} className="animate-spin" />
        ) : step < 5 ? (
          <><span>次へ</span><ArrowRight size={16} /></>
        ) : (
          <><ExternalLink size={16} /><span>Stripeで口座登録</span></>
        )}
      </button>
    </div>
  );
}
