import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ productId: string }> }
) {
  const { productId } = await params;
  const admin = createAdminClient();

  const { data: product } = await admin
    .from("products")
    .select(`
      product_id, name, payment_type, min_amount, stock_limit, sold_count, track_inventory,
      event:events(event_id, title, venue, start_at)
    `)
    .eq("product_id", productId)
    .eq("type", "entrance")
    .is("deleted_at", null)
    .single();

  if (!product) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ product });
}
