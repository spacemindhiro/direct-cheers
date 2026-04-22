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
      `https://api.zipaddress.net/?zipcode=${zipcode}`,
      { signal: controller.signal, cache: "no-store" },
    );
    clearTimeout(timer);

    const data = await res.json();
    console.log("[zip-search] upstream response:", JSON.stringify(data));

    if (data.code !== 200 || !data.data) {
      return NextResponse.json({ results: null });
    }

    const d = data.data;
    return NextResponse.json({
      results: [{
        address1: d.pref ?? "",
        address2: d.city ?? "",
        address3: d.town ?? "",
        kana1: d.prefKana ?? "",
        kana2: d.cityKana ?? "",
        kana3: d.townKana ?? "",
      }],
    });
  } catch (err) {
    clearTimeout(timer);
    console.error("[zip-search] fetch error:", err);
    return NextResponse.json({ error: "upstream fetch failed" }, { status: 502 });
  }
}
