// ヘルプ画面のタブ・グループ構成。採番（①②…）はタブ×グループごとの並び順で決まる。
export type HelpTab = "user" | "artist" | "organizer";
export type HelpGroup = "prep" | "dayof";

// ヘルプの見出しアイコン（lucide-react の名前）。components/help-content.tsx の ICONS と対で持つ
export const HELP_ICON_NAMES = [
  "KeyRound", "Heart", "Ticket", "Layers", "UserCog", "CalendarPlus", "QrCode", "ScanLine", "FileCheck2",
  "Landmark", "Wallet", "TrendingUp", "UserPlus", "Mic2", "CheckCircle2", "BarChart2", "XCircle", "Zap",
  "ListChecks", "Printer", "CreditCard", "MessageCircleHeart", "DoorOpen", "Gift",
] as const;
export type HelpIconName = (typeof HELP_ICON_NAMES)[number];

export const HELP_TABS: { id: HelpTab; label: string }[] = [
  { id: "user", label: "一般ユーザー" },
  { id: "artist", label: "アーティスト" },
  { id: "organizer", label: "オーガナイザー" },
];

export const HELP_GROUPS: Record<HelpTab, { id: HelpGroup; label: string }[]> = {
  user: [],
  artist: [],
  organizer: [
    { id: "prep", label: "準備・機能" },
    { id: "dayof", label: "当日の運用" },
  ],
};
