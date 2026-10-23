import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { connectDcMcp } from "@/lib/mcp/in-process";
import { isStepUpFresh } from "@/lib/directory";
import { canUseVenues } from "@/lib/venues";
import { reserveGoogle, reverseGeocode } from "@/lib/google-maps";
import { lookupZip, normalizePostal, splitAddress } from "@/lib/address-jp";
import type { VenueRegisterCard } from "@/lib/cheery/cards";

// POST /api/cheery/action
// チアリー(AI) の確認カードのボタン。AI は通らない（本人が押したときだけ、画面からここに来る）。
//   register_venue / create_event_draft / create_qr：DC のデータを書く。MCP の書き込みのツールを、本人のまま action モードで呼ぶ
//   pin_to_address：地図に置いたピンの位置から、一番近い住所で会場の確認カードを作る（Google の位置から住所）
//   map_load：ピンを置く地図を出してよいか（地図の表示の無料の上限）。出すときに1回と数える
// 送られてきた中身は信用しない（書き込みの側がすべて判定し直す：lib/venues.ts・lib/events/create-draft.ts・lib/qr/create-qr.ts）。

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("register_venue"),
    card_id: z.string().uuid(),
    name: z.string().min(1).max(100),
    postal_code: z.string().min(7).max(10),
    prefecture: z.string().min(1).max(10),
    city: z.string().min(1).max(50),
    town: z.string().max(100).nullable(),
    line1: z.string().min(1).max(200),
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
  }),
  z.object({
    action: z.literal("create_event_draft"),
    card_id: z.string().uuid(),
    title: z.string().min(1).max(100),
    venue_id: z.string().uuid(),
    start_at: z.string().max(40),
    end_at: z.string().max(40),
    organizer_profile_id: z.string().uuid().nullable(),
    performer_ids: z.array(z.string().uuid()).max(20),
  }),
  z.object({
    action: z.literal("create_qr"),
    card_id: z.string().uuid(),
    event_id: z.string().uuid(),
    product_type: z.enum(["standard", "message", "entrance"]),
    payment_type: z.enum(["A", "B", "C"]).nullable(),
    label: z.string().min(1).max(50),
    min_amount: z.number().int(),
    max_amount: z.number().int(),
    stock_limit: z.number().int().min(1).max(100000).nullable(),
    sales_start_at: z.string().max(40).nullable(),
    sales_end_at: z.string().max(40).nullable(),
    recipient_profile_id: z.string().uuid(),
    recipient_name_context: z.enum(["organizer", "artist"]),
    targets: z.array(z.object({ profile_id: z.string().uuid(), distribution_ratio: z.number().min(0).max(1) })).min(1).max(10),
    image_url: z.string().max(500).nullable(),
  }),
  z.object({
    action: z.literal("pin_to_address"),
    name: z.string().min(1).max(100),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  z.object({ action: z.literal("map_load") }),
]);

// 共用の関数の英語のエラーを、画面に出す文にする
const ERROR_TEXT: Record<string, string> = {
  "Organizer only": "イベントを作る権限がありません",
  "No agent assigned": "担当エージェントが決まっていないため、まだイベントを作れません",
  Forbidden: "この名義では作れません",
  "Missing required fields": "入力が足りません",
  "Event not found": "イベントが見つかりません",
  "Invalid product type": "このタイプの QR は作れません",
};

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "ログインが必要です" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "入力の形式が正しくありません" }, { status: 400 });
  const body = parsed.data;
  const admin = createAdminClient();

  if (body.action === "map_load" || body.action === "pin_to_address") {
    if (!(await canUseVenues(supabase, user.id))) return NextResponse.json({ ok: false, error: "権限がありません" }, { status: 403 });
    if (!process.env.GOOGLE_PLACES_API_KEY || !process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY) {
      return NextResponse.json({ ok: false, error: "地図は準備中です。住所をチャットで伝えてください" }, { status: 503 });
    }
  }

  if (body.action === "map_load") {
    const id = await reserveGoogle(admin, "maps_js", user.id);
    if (id == null) return NextResponse.json({ ok: false, error: "地図は今月の上限に達しました。住所をチャットで伝えてください" }, { status: 429 });
    await admin.rpc("google_api_finish", { p_call_id: id, p_outcome: "found" });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "pin_to_address") {
    const hit = await reverseGeocode(admin, user.id, body.latitude, body.longitude).catch(() => "error" as const);
    if (hit === null) return NextResponse.json({ ok: false, error: "住所の検索は今月の上限に達しました。住所をチャットで伝えてください" }, { status: 429 });
    if (hit === "error") return NextResponse.json({ ok: false, error: "住所を引けませんでした。少しずらしてもう一度置いてください" }, { status: 502 });
    if (hit === "not_found") return NextResponse.json({ ok: false, error: "この位置の住所が見つかりません。陸の上に置いてください" }, { status: 404 });
    const postal = normalizePostal(hit.postalCode);
    const zip = postal ? await lookupZip(postal).catch(() => null) : null;
    const split = splitAddress(hit.formattedAddress, hit.postalCode, zip, { allowEmptyLine1: true });
    if (!split.ok) return NextResponse.json({ ok: false, error: "この位置の住所と郵便番号を照らし合わせられませんでした。少しずらしてもう一度置いてください" }, { status: 422 });
    const card: VenueRegisterCard = {
      kind: "venue_register",
      card_id: randomUUID(),
      name: body.name,
      ...split.address,
      latitude: body.latitude,
      longitude: body.longitude,
      maps_uri: null,
      source: "pin",
    };
    return NextResponse.json({ ok: true, card });
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("profile_id", user.id).maybeSingle();
  const stepUpFresh = isStepUpFresh((await cookies()).get("dc_stepup")?.value);
  const mcp = await connectDcMcp({
    userId: user.id, email: user.email ?? null, role: profile?.role ?? "user", supabase, admin, stepUpFresh, mode: "action",
  });
  try {
    const { action, ...args } = body;
    const r = await mcp.call(action, args).catch(() => ({ text: "", isError: true }));
    let result: { ok: boolean; error?: string; [k: string]: unknown };
    try {
      result = JSON.parse(r.text);
    } catch {
      // ツールが無い（ロールが足りない）・入力の検査に落ちた
      return NextResponse.json({ ok: false, error: "この操作はできません" }, { status: 403 });
    }
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: ERROR_TEXT[result.error ?? ""] ?? result.error ?? "処理に失敗しました" }, { status: 400 });
    }
    return NextResponse.json(result);
  } finally {
    await mcp.close().catch(() => {});
  }
}
