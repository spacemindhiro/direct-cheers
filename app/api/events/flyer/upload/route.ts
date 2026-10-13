import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { randomUUID } from "crypto";
import sharp from "sharp";

// イベントのフライヤー画像（任意）のアップロード。保存先URLを返すだけで、events への紐付けは
// イベント作成・編集の保存時に base_flyer_url として送る（作成画面ではまだ event_id が無いため）。
// フライヤーは縦長が多いので切り抜かずに元の比率のまま保存し、QR画像・チケット画像に使うときに切り抜く。
const BUCKET = "event-images";
const MAX_SIDE = 1600;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // イベントを作成・編集できるのは organizer 以上（ロールは上位互換）
  const { data: profile } = await supabase.from("profiles").select("role").eq("profile_id", user.id).single();
  if (!["organizer", "agent", "admin"].includes(profile?.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return NextResponse.json({ error: "No file" }, { status: 400 });

  let resized: Buffer;
  try {
    resized = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize(MAX_SIDE, MAX_SIDE, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    return NextResponse.json({ error: "画像を読み込めませんでした" }, { status: 400 });
  }

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
