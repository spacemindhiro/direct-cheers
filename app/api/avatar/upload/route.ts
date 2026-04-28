import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { randomUUID } from "crypto";
import sharp from "sharp";

const BUCKET = "avatars";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const contentType = file.type.startsWith("image/") ? file.type : "image/jpeg";
  const buffer = Buffer.from(await file.arrayBuffer());

  const resized = await sharp(buffer)
    .resize(400, 400, { fit: "cover", position: "centre" })
    .webp({ quality: 85 })
    .toBuffer();

  const admin = createAdminClient();
  const filePath = `${user.id}/${randomUUID()}.webp`;

  const { error } = await admin.storage.from(BUCKET).upload(filePath, resized, {
    contentType: "image/webp",
    upsert: false,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(filePath);
  return NextResponse.json({ url: publicUrl });
}
