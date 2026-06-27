import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const zipcode = searchParams.get("zipcode")?.replace(/\D/g, "");

  if (!zipcode || zipcode.length !== 7) {
    return NextResponse.json({ error: "invalid zipcode" }, { status: 400 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(
      `https://postcode.teraren.com/postcodes/${zipcode}.json`,
      { signal: controller.signal, cache: "no-store" },
    );
    clearTimeout(timer);

    if (!res.ok) {
      return NextResponse.json({ results: null });
    }

    const d = await res.json();
    console.log("[zip-search] upstream response:", JSON.stringify(d));

    return NextResponse.json({
      results: [{
        address1: d.prefecture ?? "",
        address2: d.city ?? "",
        address3: d.suburb ?? "",
        kana1: d.prefecture_kana ?? "",
        kana2: d.city_kana ?? "",
        kana3: d.suburb_kana ?? "",
      }],
    });
  } catch (err) {
    clearTimeout(timer);
    console.error("[zip-search] fetch error:", err);
    return NextResponse.json({ error: "upstream fetch failed" }, { status: 502 });
  }
}
