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
  CalendarPlus,
  QrCode,
  ScanLine,
  FileCheck2,
  Landmark,
  Wallet,
  TrendingUp,
  UserPlus,
  Mic2,
  CheckCircle2,
  BarChart2,
  XCircle,
  Zap,
  ListChecks,
  Printer,
  Plus,
  CreditCard,
  MessageCircleHeart,
  DoorOpen,
  Gift,
} from "lucide-react";
import { TutorialVideoButton } from "./tutorial-video-button";
import { TUTORIAL_VIDEO_IDS } from "@/lib/tutorial-videos";
import { helpSections, helpFaqs, helpTitle, HELP_TABS, HELP_GROUPS, type HelpTab, type HelpGroup } from "@/lib/knowledge";
import { parseMarkup } from "@/lib/knowledge/markup";
import type { KnowledgeBlock, KnowledgeSection, HelpIconTone } from "@/lib/knowledge/types";
import type { HelpIconName } from "@/lib/knowledge/placement";

// ヘルプの中身は lib/knowledge/items/ が単一の正（チアリー(AI)と共有）。ここは見た目だけを持つ。
// 項目の追加・文言の修正・並べ替えは items 側で行う（①②…と相互参照の番号は自動で振り直される）。

export type HelpRole = HelpTab;

const ICONS: Record<HelpIconName, typeof Zap> = {
  KeyRound, Heart, Ticket, Layers, UserCog, CalendarPlus, QrCode, ScanLine, FileCheck2, Landmark, Wallet,
  TrendingUp, UserPlus, Mic2, CheckCircle2, BarChart2, XCircle, Zap, ListChecks, Printer, CreditCard,
  MessageCircleHeart, DoorOpen, Gift,
};

const ICON_TONE: Record<HelpIconTone, string> = {
  pink: "text-pink-500",
  indigo: "text-indigo-400",
  red: "text-red-400",
};

// 本文の記法（太字・強調・リンク・定数・相互参照）をReact要素にする
function Rich({ text }: { text: string }) {
  return (
    <>
      {parseMarkup(text).map((tok, i) => {
        if (tok.t === "text") return tok.v;
        if (tok.t === "b") return <b key={i}>{tok.v}</b>;
        if (tok.t === "hl") return <span key={i} className="text-indigo-300">{tok.v}</span>;
        return <a key={i} href={tok.href} className="text-indigo-300 underline">{tok.v}</a>;
      })}
    </>
  );
}

function Section({
  icon,
  title,
  subtitle,
  videoId,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  videoId?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex-1 flex items-center gap-3 min-w-0 text-left"
        >
          <div className="w-9 h-9 bg-pink-500/10 rounded-xl flex items-center justify-center border border-pink-500/20 shrink-0">
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-white">{title}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{subtitle}</p>
          </div>
        </button>
        <TutorialVideoButton youtubeId={videoId} label={`動画で見る：${title}`} compact />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "閉じる" : "開く"}
          className="shrink-0 w-7 h-7 flex items-center justify-center text-slate-500 hover:text-slate-300"
        >
          <Plus size={16} className={`transition-transform ${open ? "rotate-45" : ""}`} />
        </button>
      </div>
      {open && (
        <div className="text-xs text-slate-300 leading-relaxed space-y-2 pl-12">
          {children}
        </div>
      )}
    </div>
  );
}

// 当日オペレーションの時系列ブロック。ラベル（前日まで／開場前…）と箇条書きをひとまとまりにする
function Phase({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="inline-block text-[10px] font-black tracking-widest text-pink-400 bg-pink-500/10 border border-pink-500/20 rounded-full px-2.5 py-0.5">
        {label}
      </p>
      <ul className="list-disc pl-4 space-y-1">{children}</ul>
    </div>
  );
}

function Warn({ tone, title, text }: { tone: "amber" | "red"; title: string; text: string }) {
  return (
    <div className={tone === "amber" ? "bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mt-2" : "bg-red-500/10 border border-red-500/20 rounded-xl p-3 mt-2"}>
      <p className={tone === "amber" ? "text-[11px] font-black text-amber-400" : "text-[11px] font-black text-red-400"}>
        <Rich text={`⚠ ${title}`} />
      </p>
      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
        <Rich text={text} />
      </p>
    </div>
  );
}

function Block({ block }: { block: KnowledgeBlock }) {
  switch (block.type) {
    case "p":
      return <p><Rich text={block.text} /></p>;
    case "ul":
      return (
        <ul className="list-disc pl-4 space-y-1">
          {block.items.map((s, i) => <li key={i}><Rich text={s} /></li>)}
        </ul>
      );
    case "warn":
      return <Warn tone={block.tone} title={block.title} text={block.text} />;
    case "phase":
      return (
        <Phase label={block.label}>
          {block.items.map((s, i) => <li key={i}><Rich text={s} /></li>)}
        </Phase>
      );
  }
}

function KnowledgeSectionCard({ section }: { section: KnowledgeSection }) {
  const help = section.help!;
  const Icon = ICONS[help.icon];
  return (
    <Section
      icon={<Icon size={16} className={ICON_TONE[help.iconTone ?? "pink"]} />}
      title={helpTitle(section)}
      subtitle={help.subtitle}
      videoId={help.video ? TUTORIAL_VIDEO_IDS[help.video] : undefined}
    >
      {section.body.map((b, i) => <Block key={i} block={b} />)}
    </Section>
  );
}

function SectionList({ tab, group }: { tab: HelpTab; group?: HelpGroup }) {
  return (
    <div className="space-y-4">
      {helpSections(tab, group).map((s) => <KnowledgeSectionCard key={s.id} section={s} />)}
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
        <span className="text-xs font-bold text-white"><Rich text={q} /></span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <p className="px-4 pb-3 text-[11px] text-slate-400 leading-relaxed"><Rich text={a} /></p>
      )}
    </div>
  );
}

function FaqList({ tab }: { tab: HelpTab }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-indigo-500/10 rounded-xl flex items-center justify-center border border-indigo-500/20 shrink-0">
          <HelpCircle size={16} className="text-indigo-400" />
        </div>
        <p className="text-sm font-black text-white">よくある質問</p>
      </div>
      <div className="space-y-2">
        {helpFaqs(tab).map((f) => <Faq key={f.id} q={f.q} a={f.a} />)}
      </div>
    </div>
  );
}

// 一般ユーザー・アーティスト：項目の下によくある質問
function SimpleGuide({ tab }: { tab: HelpTab }) {
  return (
    <div className="space-y-4">
      {helpSections(tab).map((s) => <KnowledgeSectionCard key={s.id} section={s} />)}
      <FaqList tab={tab} />
    </div>
  );
}

function OrganizerGuide() {
  const [group, setGroup] = useState<HelpGroup>("prep");

  return (
    <div className="space-y-4">
      <div className="flex gap-2 bg-slate-900 border border-slate-800 rounded-2xl p-1">
        {HELP_GROUPS.organizer.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setGroup(g.id)}
            className={`flex-1 text-[11px] font-bold rounded-xl py-2 transition-colors ${
              group === g.id ? "bg-pink-500 text-white" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      <SectionList key={group} tab="organizer" group={group} />

      <FaqList tab="organizer" />
    </div>
  );
}

export function HelpContent({
  defaultRole,
  visibleRoles,
}: {
  defaultRole: HelpRole;
  visibleRoles: HelpRole[];
}) {
  const [tab, setTab] = useState<HelpRole>(defaultRole);
  const tabs = HELP_TABS.filter((t) => visibleRoles.includes(t.id));

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
      <div>
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Help & Guide</p>
        <h1 className="text-xl font-black text-white mt-1">利用マニュアル</h1>
        <p className="text-xs text-slate-500 mt-1">Direct Cheersの使い方をロール別にご案内します</p>
      </div>

      {tabs.length > 1 && (
        <div className="flex gap-2 bg-slate-900 border border-slate-800 rounded-2xl p-1">
          {tabs.map((t) => (
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
      )}

      {tab === "organizer" ? <OrganizerGuide /> : <SimpleGuide key={tab} tab={tab} />}

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
