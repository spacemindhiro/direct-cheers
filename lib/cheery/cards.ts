// チアリー(AI) の確認カード（画面とサーバーで共用）。
// カードの材料は MCP のツールの結果（_meta の CARDS_META_KEY）からだけ作り、AI の書いた文字からは作らない。
// 材料には内部 ID（venue_id・profile_id）が入るので、AI には渡さない（lib/mcp/in-process.ts が AI に渡す前に取り分ける）。
// 本人がカードのボタンを押すと、画面が /api/cheery/action に送り、DC のサーバーが書き込みのツールを呼ぶ。
// 送られてきた中身は信用せず、書き込みの側（lib/venues.ts・lib/events/create-draft.ts・lib/qr/create-qr.ts）がすべて判定し直す。

export const CARDS_META_KEY = "direct-cheers.com/cards";

// Google の店舗・ピン・手入力から作った、登録前の会場
export type VenueRegisterCard = {
  kind: "venue_register";
  card_id: string;
  name: string;
  postal_code: string;
  prefecture: string;
  city: string;
  town: string | null;
  line1: string;
  latitude: number | null;
  longitude: number | null;
  maps_uri: string | null;
  source: "google" | "pin" | "manual";
};

// 名前の無い場所：地図でピンを置いてもらう
export type VenuePinCard = {
  kind: "venue_pin";
  card_id: string;
  name: string;
  center: { latitude: number; longitude: number } | null; // 地域の文字から引いた地図の中心（引けなければ日本全体）
};

export type PerformerSlot = {
  query: string; // 本人が言った名前
  // exact：候補が言われた名前と完全に同じ人か。決まりにするのは「完全に同じ人が1人だけ」のときだけで、
  // それ以外（部分的に合う人だけ・同じ名前が複数）は本人が選ぶか「入れない」を選ぶまで作れない（勝手に決めない）
  exact: boolean;
  options: { profile_id: string; name: string; sub: string | null; connected: boolean }[];
};

export const slotDecided = (s: { exact: boolean; options: unknown[] }) => s.exact && s.options.length === 1;

export type EventDraftCard = {
  kind: "event_draft";
  card_id: string;
  title: string;
  venue: { venue_id: string; name: string; place: string };
  start_at: string; // UTC の ISO
  end_at: string;
  organizer: { profile_id: string | null; name: string }; // profile_id が null なら本人名義
  performers: PerformerSlot[];
};

// QR の宛先・配分先の候補（そのイベントの主催者・出演者だけ。lib/qr/candidates.ts）。
// 同じ人が主催者名義と出演者名義の2つで出ることがある（role で区別）
export type QrPersonOption = { profile_id: string; role: "organizer" | "artist"; name: string; avatar_url: string | null; avatar_original_url: string | null };
export type QrPersonSlot = { query: string; exact: boolean; options: QrPersonOption[] };

export type QrCreateCard = {
  kind: "qr_create";
  card_id: string;
  event: { event_id: string; title: string; draft: boolean };
  product_type: "standard" | "message" | "entrance";
  payment_type: "A" | "B" | "C" | null; // エントランスだけ
  label: string | null; // 本人がこの会話でそのまま書いたラベルだけ。無ければ null（カードで本人が決める。lib/qr/label.ts）
  min_amount: number;
  max_amount: number;
  stock_limit: number | null;
  sales_start_at: string | null; // UTC の ISO（前売り A/B だけ）
  sales_end_at: string | null;
  people: QrPersonSlot[]; // 言われた人（宛先と配分先で同じ人は1つ）
  recipient: number; // people の何番目が宛先か
  targets: { person: number; percent: number }[];
  needs_image: boolean;
  flyer_url: string | null;
};

export type CheeryCard = VenueRegisterCard | VenuePinCard | EventDraftCard | QrCreateCard;

// 書き込みが済んだあとの状態（端末の会話に一緒に残す）
export type CardDone =
  | { kind: "venue_registered"; venue_name: string }
  | { kind: "event_created"; event_id: string; title: string }
  | { kind: "qr_created"; event_id: string; qr_config_id: string; label: string };
