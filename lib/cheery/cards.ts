// チアリー(AI) の確認カード（画面とサーバーで共用）。
// カードの材料は MCP のツールの結果（_meta の CARDS_META_KEY）からだけ作り、AI の書いた文字からは作らない。
// 材料には内部 ID（venue_id・profile_id）が入るので、AI には渡さない（lib/mcp/in-process.ts が AI に渡す前に取り分ける）。
// 本人がカードのボタンを押すと、画面が /api/cheery/action に送り、DC のサーバーが書き込みのツールを呼ぶ。
// 送られてきた中身は信用せず、書き込みの側（lib/venues.ts・lib/events/create-draft.ts）がすべて判定し直す。

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
  options: { profile_id: string; name: string; sub: string | null; connected: boolean }[]; // 1人なら決まり、複数なら本人が選ぶ
};

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

export type CheeryCard = VenueRegisterCard | VenuePinCard | EventDraftCard;

// 書き込みが済んだあとの状態（端末の会話に一緒に残す）
export type CardDone =
  | { kind: "venue_registered"; venue_name: string }
  | { kind: "event_created"; event_id: string; title: string };
