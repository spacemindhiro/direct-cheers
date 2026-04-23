import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "event-evidence";

const MIME_MAP: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  gif: "image/gif", webp: "image/webp", heic: "image/heic",
  heif: "image/heif", avif: "image/avif",
};

function resolveContentType(file: File): string {
  const t = file.type;
  if (t && t !== "application/octet-stream") return t;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_MAP[ext] ?? "image/jpeg";
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: event } = await supabase
    .from("events")
    .select("organizer_profile_id")
    .eq("event_id", eventId)
    .single();

  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  if (event.organizer_profile_id !== user.id)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const formData = await req.formData();
  const files = formData.getAll("files") as File[];

  if (files.length === 0)
    return NextResponse.json({ error: "No files provided" }, { status: 400 });

  // 全ファイルのバッファをまとめて先読み（ストリーム消費問題を回避）
  const fileEntries = await Promise.all(
    files.map(async (file) => {
      const contentType = resolveContentType(file);
      const ext = contentType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
      const baseName = (file.name || "photo")
        .replace(/\.[^.]+$/, "")
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .replace(/^[_-]+|[_-]+$/g, "")
        || "photo";
      const path = `${eventId}/${randomUUID()}-${baseName}.${ext}`;
      const data = new Uint8Array(await file.arrayBuffer());
      return { path, data, contentType };
    })
  );

  const paths: string[] = [];

  for (const { path, data, contentType } of fileEntries) {
    const { error } = await admin.storage
      .from(BUCKET)
      .upload(path, data, { contentType, upsert: false });

    if (error) {
      console.error("[evidence/upload] storage error:", path, error);
      return NextResponse.json({ error: `アップロード失敗: ${error.message}` }, { status: 500 });
    }

    paths.push(path);
  }

  return NextResponse.json({ paths });
}
