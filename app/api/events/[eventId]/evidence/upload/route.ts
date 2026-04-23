import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "event-evidence";

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

  const paths: string[] = [];

  for (const file of files) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${eventId}/${Date.now()}-${safeName}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error } = await admin.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: file.type || `image/${ext}`,
        upsert: false,
      });

    if (error) {
      return NextResponse.json({ error: `アップロード失敗: ${error.message}` }, { status: 500 });
    }

    paths.push(path);
  }

  return NextResponse.json({ paths });
}
