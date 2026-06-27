import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  console.log("[wallet/v1/log]", JSON.stringify(body));
  return new NextResponse(null, { status: 200 });
}
