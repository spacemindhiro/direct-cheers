// チアリー(AI) の入口まわりの、URL から決まること（画面の部品とテストで共用。React を持ち込まない）

// 今いる画面の種類（lib/ai/prompt.ts の SCREEN_LABELS のキー）。入力途中の内容などは送らず、種類だけを渡す
const SCREEN_RULES: [RegExp, string][] = [
  [/^\/dashboard\/help$/, "help"],
  [/^\/dashboard\/events\/create$/, "event_create"],
  [/^\/dashboard\/events\/[^/]+\/qr\/create$/, "qr_create"],
  [/^\/dashboard\/events\/[^/]+\/qr\/[^/]+$/, "qr_detail"],
  [/^\/dashboard\/events\/[^/]+\/evidence$/, "evidence"],
  [/^\/dashboard\/events\/[^/]+$/, "event_detail"],
  [/^\/dashboard\/events$/, "events"],
  [/^\/dashboard\/payout$/, "payout"],
  [/^\/dashboard\/income$/, "income"],
  [/^\/dashboard\/profile$/, "profile"],
  [/^\/dashboard\/account$/, "account"],
  [/^\/dashboard\/collection$/, "collection"],
  [/^\/dashboard\/invitations$/, "invitations"],
  [/^\/tickets$/, "tickets"],
  [/^\/dashboard$/, "home"],
];

// 先頭のロケール（/ja/…）は外して判定する
function normalize(pathname: string): string {
  const p = pathname.replace(/\/+$/, "") || "/";
  return p.replace(/^\/(ja|en)(?=\/|$)/, "") || "/";
}

export function screenOf(pathname: string): string | undefined {
  const p = normalize(pathname);
  return SCREEN_RULES.find(([re]) => re.test(p))?.[1];
}

// 画面下を使う画面（入場スキャナ・タッチ決済・会場ディスプレイ・スキャナ用QR）では右下の浮きボタンを出さない。
// ヘッダーの「?」からは開ける
const NO_FLOATING_BUTTON = [/\/checkin(\/|$)/, /\/touch-pay(\/|$)/, /\/display(\/|$)/, /^\/dashboard\/scanner-qr$/];

export function showFloatingButton(pathname: string): boolean {
  const p = normalize(pathname);
  return !NO_FLOATING_BUTTON.some((re) => re.test(p));
}
