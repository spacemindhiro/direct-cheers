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
    // zipcloud はサーバーサイドからは疎通できる（CORSはブラウザ直呼びの問題だった）
    const res = await fetch(
      `https://zipcloud.ibsregion.com/api/search?zipcode=${zipcode}`,
      { signal: controller.signal, cache: "no-store" },
    );
    clearTimeout(timer);

    const data = await res.json();
    console.log("[zip-search] upstream response:", JSON.stringify(data));

    // zipcloud はそのまま返す（results, kana1/2/3 含む）
    return NextResponse.json(data);
  } catch (err) {
    clearTimeout(timer);
    console.error("[zip-search] fetch error:", err);
    return NextResponse.json({ error: "upstream fetch failed" }, { status: 502 });
  }
}
