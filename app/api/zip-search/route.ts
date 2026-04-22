import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const zipcode = searchParams.get("zipcode")?.replace(/\D/g, "");

  if (!zipcode || zipcode.length !== 7) {
    return NextResponse.json({ error: "invalid zipcode" }, { status: 400 });
  }

  const res = await fetch(`https://zipcloud.ibsregion.com/api/search?zipcode=${zipcode}`, {
    headers: { "Accept": "application/json" },
  });

  if (!res.ok) {
    return NextResponse.json({ error: "upstream error" }, { status: 502 });
  }

  const data = await res.json();
  return NextResponse.json(data);
}
