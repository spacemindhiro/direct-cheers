// 会場のツール（organizer 以上。会場の検索・登録 API と同じ範囲）。
//   読み取り（AI に渡す）：find_venue・check_venue_address・venue_pin
//     会場マスタを探し、無ければ Google で実在を確かめ、郵便番号と照らし合わせてから確認カードを出す。登録はしない
//   書き込み（AI に渡さない。本人がカードのボタンを押したときに /api/cheery/action から呼ぶ）：register_venue
// AI に返すのは店名・住所などの表示用の値だけ。venue_id とカードの材料は _meta（cards.ts）に入れて画面にだけ渡す。
// 登録した会場は全主催者が選べ、直し・削除の画面が無いので、確認を通らないものはカードにしない（p5-design.md 7章）。
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { registerVenue, searchVenues } from "@/lib/venues";
import { geocodeArea, searchPlaces } from "@/lib/google-maps";
import { lookupZip, normalizePostal, splitAddress, cleanFormatted, type VenueAddress } from "@/lib/address-jp";
import { claimCard, finishCard, releaseCard } from "@/lib/cheery/card-claim";
import type { VenuePinCard, VenueRegisterCard } from "@/lib/cheery/cards";
import type { DcMcpContext } from "../context";

export type ToolOutput = { text: string; cards?: (VenueRegisterCard | VenuePinCard)[] };

const MAX_GOOGLE_HITS = 3;
const place = (a: { prefecture: string; city: string; town?: string | null; line1?: string }) =>
  `${a.prefecture}${a.city}${a.town ?? ""}${a.line1 ?? ""}`;
const googleReady = () => !!process.env.GOOGLE_PLACES_API_KEY;

export const FIND_VENUE = {
  name: "find_venue",
  minRole: "organizer",
  title: "会場を探す",
  description:
    "イベントの会場を探す。まず DC の会場マスタ（全主催者で共有）を名前で探し、無ければ Google の地図で店・施設を探して、実在と住所（郵便番号との照合）を確かめた候補を確認カードにして本人に見せる。登録はしない（本人がカードの［この会場を登録する］を押したときだけ登録される）。閉店した店は登録できない。",
  inputSchema: {
    name: z.string().min(1).max(100).describe("会場名（本人が言った名前）"),
    area: z.string().max(100).optional().describe("地域（例「下北沢」「山梨県北杜市」）。同じ名前の店を絞り込むのに使う"),
  },
} as const;

async function venueCard(name: string, address: VenueAddress, extra: Pick<VenueRegisterCard, "latitude" | "longitude" | "maps_uri" | "source">): Promise<VenueRegisterCard> {
  return { kind: "venue_register", card_id: randomUUID(), name, ...address, ...extra };
}

export async function findVenue(ctx: DcMcpContext, input: { name: string; area?: string }): Promise<ToolOutput> {
  const name = input.name.trim();
  const master = await searchVenues(ctx.admin, name);
  const exact = master.find((v) => v.name === name);
  if (exact) {
    return { text: `会場マスタに「${exact.name}」（${exact.prefecture}${exact.city}）があります。イベントの会場にはこの名前をそのまま使ってください（新しく登録しません）。` };
  }
  const out: string[] = [];
  if (master.length > 0) {
    out.push("会場マスタの似た名前の会場（このどれかなら、その名前をそのまま使います。違えば本人に確かめてください）：",
      ...master.slice(0, 5).map((v) => `- ${v.name}（${v.prefecture}${v.city}）`));
  }
  if (!googleReady()) {
    out.push("地図での検索は準備中です。住所が分かれば check_venue_address、名前の無い場所なら venue_pin を使ってください。");
    return { text: out.join("\n") };
  }
  const hits = await searchPlaces(ctx.admin, ctx.userId, [name, input.area?.trim()].filter(Boolean).join(" "));
  if (hits === null) {
    out.push("地図での検索は今月の上限に達しているため使えません。本人に郵便番号と住所を聞いて check_venue_address を使ってください。");
    return { text: out.join("\n") };
  }
  const cards: VenueRegisterCard[] = [];
  for (const h of hits.slice(0, MAX_GOOGLE_HITS)) {
    if (h.closed) {
      out.push(`- ${h.name}（${cleanFormatted(h.formattedAddress)}）：閉店しているため登録できません`);
      continue;
    }
    const postal = normalizePostal(h.postalCode);
    const split = splitAddress(h.formattedAddress, h.postalCode, postal ? await lookupZip(postal) : null);
    if (!split.ok) {
      out.push(`- ${h.name}（${cleanFormatted(h.formattedAddress)}）：住所と郵便番号の照合ができないため、このままでは登録できません。本人に住所を確かめて check_venue_address を使ってください`);
      continue;
    }
    if (master.some((v) => v.name === h.name)) {
      out.push(`- ${h.name}：会場マスタに同じ名前があります。その会場を使ってください`);
      continue;
    }
    cards.push(await venueCard(h.name, split.address, { latitude: h.latitude, longitude: h.longitude, maps_uri: h.mapsUri, source: "google" }));
    out.push(`- ${h.name}（〒${split.address.postal_code} ${place(split.address)}）：確認カードを出しました`);
  }
  if (hits.length === 0) {
    out.push("Google の地図では見つかりませんでした。住所が分かれば check_venue_address、名前の無い場所（砂浜・空き地・山の中など）なら venue_pin を使ってください。");
  } else if (cards.length > 0) {
    out.push("本人がカードの［この会場を登録する］を押すまで登録されません。どれが正しいかは本人に地図で確かめてもらってください。");
  }
  return { text: out.join("\n"), cards };
}

export const CHECK_VENUE_ADDRESS = {
  name: "check_venue_address",
  minRole: "organizer",
  title: "会場の住所を確かめる",
  description:
    "本人が言った郵便番号と住所を、郵便番号の住所と照らし合わせ、合っていれば会場の確認カードを出す（地図に無い会場・地図の検索が使えないとき用）。登録はしない。番地が分からない場所は、番地の代わりに現地の目印（例「白いゲート前」）でもよい。",
  inputSchema: {
    name: z.string().min(1).max(100).describe("会場名"),
    postal_code: z.string().min(7).max(10).describe("郵便番号（例 150-0041）"),
    address: z.string().min(1).max(200).describe("住所（都道府県から。番地が無ければ目印）"),
  },
} as const;

export async function checkVenueAddress(ctx: DcMcpContext, input: { name: string; postal_code: string; address: string }): Promise<ToolOutput> {
  const name = input.name.trim();
  const master = await searchVenues(ctx.admin, name);
  if (master.some((v) => v.name === name)) return { text: `会場マスタに「${name}」があります。その会場をそのまま使ってください。` };
  const postal = normalizePostal(input.postal_code);
  if (!postal) return { text: "郵便番号は7桁で聞き直してください。" };
  const zip = await lookupZip(postal);
  if (!zip) return { text: "その郵便番号の地域が見つかりません。本人に郵便番号を確かめてください。" };
  // 都道府県・市区町村を省いて言われたときは、郵便番号の地域を前に付けて照らし合わせる
  const cleaned = cleanFormatted(input.address);
  const full = cleaned.startsWith(zip.prefecture) ? cleaned : cleaned.startsWith(zip.city) ? `${zip.prefecture}${cleaned}` : `${zip.prefecture}${zip.city}${cleaned}`;
  const split = splitAddress(full, postal, zip);
  if (!split.ok) {
    const why = split.reason === "no_line1" ? "番地（または現地の目印）が無い" : "郵便番号の地域（" + zip.prefecture + zip.city + "）と住所が合わない";
    return { text: `${why}ため、確認カードを出せません。本人に確かめてください。` };
  }
  const card = await venueCard(name, split.address, { latitude: null, longitude: null, maps_uri: null, source: "manual" });
  return {
    text: `「${name}」（〒${split.address.postal_code} ${place(split.address)}）の確認カードを出しました。本人が［この会場を登録する］を押すまで登録されません。`,
    cards: [card],
  };
}

export const VENUE_PIN = {
  name: "venue_pin",
  minRole: "organizer",
  title: "地図でピンを置いてもらう",
  description:
    "名前の無い場所（砂浜・空き地・山の中など、Google の地図に載っていない場所）の会場を登録するときに使う。本人に地図でピンを置いてもらうカードを出す。本人がピンを置くと、一番近い住所から会場の確認カードが出る。会場名は本人に決めてもらう（例「△△海岸 特設会場」）。",
  inputSchema: {
    name: z.string().min(1).max(100).describe("会場名（本人が決めた名前）"),
    area: z.string().max(100).optional().describe("だいたいの地域（例「山梨県北杜市」）。地図の初めの位置に使う"),
  },
} as const;

export async function venuePin(ctx: DcMcpContext, input: { name: string; area?: string }): Promise<ToolOutput> {
  const name = input.name.trim();
  const master = await searchVenues(ctx.admin, name);
  if (master.some((v) => v.name === name)) return { text: `会場マスタに「${name}」があります。別の名前にするか、その会場を使ってください。` };
  if (!googleReady() || !process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY) {
    return { text: "地図は準備中です。本人に郵便番号と、住所または最寄りの地名・現地の目印を聞いて check_venue_address を使ってください。" };
  }
  const area = input.area?.trim();
  const center = area ? await geocodeArea(ctx.admin, ctx.userId, area) : "not_found";
  const card: VenuePinCard = {
    kind: "venue_pin",
    card_id: randomUUID(),
    name,
    center: center && center !== "not_found" ? center : null,
  };
  return { text: `「${name}」の場所を地図で指してもらうカードを出しました。ピンを置くと、一番近い住所で会場の確認カードが出ます。`, cards: [card] };
}

// ── 書き込み（AI に渡さない）──────────────────────────────

export const REGISTER_VENUE = {
  name: "register_venue",
  minRole: "organizer",
  title: "会場を登録する（本人の確認後）",
  description: "確認カードで本人が［この会場を登録する］を押したときに、DC のサーバーが呼ぶ。AI には渡さない。",
  inputSchema: {
    card_id: z.string().uuid(),
    name: z.string().min(1).max(100),
    postal_code: z.string().min(7).max(10),
    prefecture: z.string().min(1).max(10),
    city: z.string().min(1).max(50),
    town: z.string().max(100).nullable(),
    line1: z.string().min(1).max(200),
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
  },
} as const;

export type RegisterVenueToolInput = {
  card_id: string; name: string; postal_code: string; prefecture: string; city: string; town: string | null; line1: string;
  latitude: number | null; longitude: number | null;
};

export type WriteResult = { ok: true; id: string; name: string; already: boolean } | { ok: false; error: string };

export async function registerVenueTool(ctx: DcMcpContext, input: RegisterVenueToolInput): Promise<WriteResult> {
  // 画面から来た中身は信用しない。郵便番号の地域と、都道府県・市区町村がもう一度合うことを確かめる
  const postal = normalizePostal(input.postal_code);
  const zip = postal ? await lookupZip(postal) : null;
  if (!zip || zip.prefecture !== input.prefecture || zip.city !== input.city) {
    return { ok: false, error: "郵便番号と住所が合いません" };
  }
  const claim = await claimCard(ctx.admin, input.card_id, ctx.userId, "venue_register");
  if (claim === "invalid") return { ok: false, error: "このカードは使えません" };
  if (!claim.fresh) {
    if (!claim.resultId) return { ok: false, error: "登録の途中です。少し待ってから会話を開き直してください" };
    const { data } = await ctx.admin.from("venues").select("venue_id, name").eq("venue_id", claim.resultId).maybeSingle();
    return data ? { ok: true, id: data.venue_id, name: data.name, already: true } : { ok: false, error: "登録した会場が見つかりません" };
  }
  const r = await registerVenue(ctx.supabase, ctx.admin, ctx.userId, {
    name: input.name, postal_code: `${postal!.slice(0, 3)}-${postal!.slice(3)}`, prefecture: input.prefecture, city: input.city,
    town: input.town, line1: input.line1, latitude: input.latitude, longitude: input.longitude,
  });
  if (!r.ok) {
    await releaseCard(ctx.admin, input.card_id);
    return { ok: false, error: r.error };
  }
  await finishCard(ctx.admin, input.card_id, r.venue.venue_id);
  return { ok: true, id: r.venue.venue_id, name: r.venue.name, already: false };
}
