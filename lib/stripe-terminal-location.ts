import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

type VenueRow = {
  venue_id: string;
  name: string;
  postal_code: string;
  prefecture: string;
  city: string;
  town: string | null;
  line1: string;
  stripe_terminal_location_id: string | null;
};

// 会場に対応するStripe Terminal LocationのIDを解決する。
// 会場登録時にはStripe APIを呼ばず、タッチ決済で実際に接続が必要になった
// この関数の初回呼び出し時にだけLocationを作成し、venuesテーブルにキャッシュする
// （会場登録という単純なDB操作にStripe API障害のリスクを持ち込まないため）。
export async function resolveTerminalLocationId(venueId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: venue } = await admin
    .from("venues")
    .select("venue_id, name, postal_code, prefecture, city, town, line1, stripe_terminal_location_id")
    .eq("venue_id", venueId)
    .single<VenueRow>();

  if (!venue) return null;
  if (venue.stripe_terminal_location_id) return venue.stripe_terminal_location_id;

  const location = await stripe.terminal.locations.create({
    display_name: venue.name,
    address_kanji: {
      country: "JP",
      postal_code: venue.postal_code,
      state: venue.prefecture,
      city: venue.city,
      town: venue.town ?? "",
      line1: venue.line1,
    },
  });

  await admin
    .from("venues")
    .update({ stripe_terminal_location_id: location.id })
    .eq("venue_id", venueId);

  return location.id;
}
