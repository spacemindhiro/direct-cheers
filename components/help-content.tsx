"use client";

import { useState } from "react";
import {
  HelpCircle,
  KeyRound,
  Heart,
  Ticket,
  Layers,
  UserCog,
  ChevronDown,
  Mail,
} from "lucide-react";

export type HelpRole = "user" | "organizer" | "artist";

const TABS: { id: HelpRole; label: string }[] = [
  { id: "user", label: "一般ユーザー" },
  { id: "organizer", label: "オーガナイザー" },
  { id: "artist", label: "アーティスト" },
];

function Section({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-pink-500/10 rounded-xl flex items-center justify-center border border-pink-500/20 shrink-0">
          {icon}
        </div>
        <div>
          <p className="text-sm font-black text-white">{title}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">{subtitle}</p>
        </div>
      </div>
      <div className="text-xs text-slate-300 leading-relaxed space-y-2 pl-12">
        {children}
      </div>
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-slate-700 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="text-xs font-bold text-white">{q}</span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <p className="px-4 pb-3 text-[11px] text-slate-400 leading-relaxed">{a}</p>
      )}
    </div>
  );
}

function UserGuide() {
  return (
    <div className="space-y-4">
      <Section
        icon={<KeyRound size={16} className="text-pink-500" />}
        title="① 会員登録・ログイン"
        subtitle="Member Access"
      >
        <p>専用の会員登録は不要です。ログイン画面でメールアドレスを入力するだけで、初めての方は自動的にアカウントが作成されます。</p>
        <ul className="list-disc pl-4 space-y-1">
          <li>「ログインリンクを送る」を押すとメールが届くので、本文中のリンクをタップするとログインできます（パスコードの入力は不要です）</li>
          <li>Googleアカウントでもログインできます</li>
          <li>初回ログイン後に案内される「1秒でログイン」でパスキー（顔認証・指紋認証）を登録すると、次回から入力なしでログインできます（あとで設定も可能）</li>
        </ul>
      </Section>

      <Section
        icon={<Heart size={16} className="text-pink-500" />}
        title="② チアを送る・チケットを購入する"
        subtitle="Send Cheers"
      >
        <p>会場やSNS、告知物にあるQRコードを読み取ると、アーティストやイベントの専用ページが開きます。</p>
        <ul className="list-disc pl-4 space-y-1">
          <li>スライダーで金額を選び（イベントによっては人数・杯数の指定も）、メールアドレスを入力します</li>
          <li>「¥○○ を応援する」（チケットの場合は「購入する」）ボタンを押すと決済に進みます</li>
          <li>Apple Pay・Google Pay・クレジットカードに対応。イベントによってはPayPayも利用できます</li>
          <li>ボタンを押した時点で入力したメールアドレスでアカウントが自動作成されるため、事前の会員登録は不要です</li>
        </ul>
      </Section>

      <Section
        icon={<Ticket size={16} className="text-pink-500" />}
        title="③ マイチケットの使い方"
        subtitle="Wallet"
      >
        <p>ダッシュボードの「マイチケット」から、購入したチケットをQRコード付きのデジタルチケットで確認できます。</p>
        <ul className="list-disc pl-4 space-y-1">
          <li>会場の入口でスタッフにこのQRコードを見せるだけで入場できます（印刷は不要です）</li>
          <li>入場が完了すると券面が「入場済み」の表示に変わります</li>
          <li>「Apple Walletに追加」ボタンで、iPhoneのWalletアプリからも表示できます</li>
          <li>事前確定型（5日前確定）のチケットのみ、イベント5日前まで「予約をキャンセル」が可能です</li>
        </ul>
      </Section>

      <Section
        icon={<Layers size={16} className="text-pink-500" />}
        title="④ カードコレクション・応援履歴"
        subtitle="Collection"
      >
        <p>ダッシュボードの「Cheers History」で、これまで応援した金額やコメントの履歴を確認できます。</p>
        <p>「カードコレクション」では、応援したアーティストのカードをまとめて振り返れます。</p>
      </Section>

      <Section
        icon={<UserCog size={16} className="text-pink-500" />}
        title="⑤ アカウント設定"
        subtitle="Account"
      >
        <ul className="list-disc pl-4 space-y-1">
          <li>「アカウント管理」の「応援履歴を統合」から、うっかり別のメールアドレスで応援してしまった履歴を今のアカウントにまとめられます</li>
          <li>パスキーに対応していない端末のために、「アカウント管理」からパスワード（8文字以上）を設定できます</li>
          <li>「パスキー管理」から、登録済みデバイスの確認・名称変更・削除・追加ができます</li>
        </ul>
      </Section>

      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-500/10 rounded-xl flex items-center justify-center border border-indigo-500/20 shrink-0">
            <HelpCircle size={16} className="text-indigo-400" />
          </div>
          <p className="text-sm font-black text-white">よくある質問</p>
        </div>
        <div className="space-y-2">
          <Faq
            q="ログインリンクのメールが届きません"
            a="迷惑メールフォルダをご確認ください。それでも届かない場合は、ログイン画面から再度メールアドレスを入力して送信し直してください。"
          />
          <Faq
            q="複数のメールアドレスで応援してしまいました"
            a="「アカウント管理」の「応援履歴を統合」から、まとめたいメールアドレスを入力して確認メールを送ると、履歴を1つのアカウントにまとめられます。"
          />
          <Faq
            q="購入したチケットをキャンセルしたい"
            a="事前確定型（5日前確定）のチケットのみ、マイチケット画面からイベント5日前までキャンセルできます。それ以外のチケットタイプは購入後のキャンセルに対応していません。"
          />
        </div>
      </div>
    </div>
  );
}

function ComingSoon({ role }: { role: "organizer" | "artist" }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 text-center space-y-2">
      <p className="text-sm font-black text-white">
        {role === "organizer" ? "オーガナイザー" : "アーティスト"}向けマニュアルは準備中です
      </p>
      <p className="text-[11px] text-slate-500">近日公開予定です。しばらくお待ちください。</p>
    </div>
  );
}

export function HelpContent({ defaultRole }: { defaultRole: HelpRole }) {
  const [tab, setTab] = useState<HelpRole>(defaultRole);

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
      <div>
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Help & Guide</p>
        <h1 className="text-xl font-black text-white mt-1">利用マニュアル</h1>
        <p className="text-xs text-slate-500 mt-1">Direct Cheersの使い方をロール別にご案内します</p>
      </div>

      <div className="flex gap-2 bg-slate-900 border border-slate-800 rounded-2xl p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 text-[11px] font-bold rounded-xl py-2 transition-colors ${
              tab === t.id
                ? "bg-pink-500 text-white"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "user" && <UserGuide />}
      {tab === "organizer" && <ComingSoon role="organizer" />}
      {tab === "artist" && <ComingSoon role="artist" />}

      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex items-start gap-3">
        <Mail size={14} className="text-slate-500 mt-0.5 shrink-0" />
        <p className="text-[10px] text-slate-500 leading-relaxed">
          このマニュアルで解決しない場合は、
          <a href="mailto:support@direct-cheers.com" className="text-slate-300 underline">
            support@direct-cheers.com
          </a>
          までお問い合わせください。
        </p>
      </div>
    </div>
  );
}
