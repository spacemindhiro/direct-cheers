import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { randomUUID } from "crypto";
import sharp from "sharp";

const BUCKET = "avatars";
// 原本（切り抜き前）の長辺。QR画像（1200×800）を原本から切り抜けるよう 1200 より大きく取る
const ORIGINAL_MAX_SIDE = 1600;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
  // 任意：切り抜く前の画像。QR画像の素材として使う（無ければ従来どおりアバターのみ）
  const original = formData.get("original") as File | null;

  const buffer = Buffer.from(await file.arrayBuffer());

  const resized = await sharp(buffer)
    .resize(400, 400, { fit: "cover", position: "centre" })
    .webp({ quality: 85 })
    .toBuffer();

  const admin = createAdminClient();
  const id = randomUUID();
  const filePath = `${user.id}/${id}.webp`;

  const { error } = await admin.storage.from(BUCKET).upload(filePath, resized, {
    contentType: "image/webp",
    upsert: false,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(filePath);

  let originalUrl: string | null = null;
  if (original && original.size > 0) {
    const originalBuffer = await sharp(Buffer.from(await original.arrayBuffer()))
      .rotate()
      .resize(ORIGINAL_MAX_SIDE, ORIGINAL_MAX_SIDE, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
    const originalPath = `${user.id}/${id}-original.webp`;
    const { error: originalError } = await admin.storage.from(BUCKET).upload(originalPath, originalBuffer, {
      contentType: "image/webp",
      upsert: false,
    });
    if (originalError) return NextResponse.json({ error: originalError.message }, { status: 500 });
    originalUrl = admin.storage.from(BUCKET).getPublicUrl(originalPath).data.publicUrl;
  }

  return NextResponse.json({ url: publicUrl, originalUrl });
}
