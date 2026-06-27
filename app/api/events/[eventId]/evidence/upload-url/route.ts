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

export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: event } = await admin
    .from("events")
    .select("organizer_profile_id, agent_id")
    .eq("event_id", eventId)
    .single();

  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .single();

  const isOwnerOrganizer = event.organizer_profile_id === user.id;
  const isAssignedAgent = profile?.role === "agent" && event.agent_id === user.id;
  const isAdmin = profile?.role === "admin";
  if (!isOwnerOrganizer && !isAssignedAgent && !isAdmin)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { filename } = await req.json() as { filename: string };

  const rawExt = (filename.split(".").pop()?.toLowerCase() ?? "jpg");
  const ext = rawExt === "jpeg" ? "jpg" : rawExt;
  const baseName = (filename.replace(/\.[^.]+$/, "") || "photo")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "")
    || "photo";
  const path = `${eventId}/${randomUUID()}-${baseName}.${ext}`;
  const contentType = MIME_MAP[rawExt] ?? "image/jpeg";

  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);

  if (error) {
    console.error("[evidence/upload-url]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ path, signedUrl: data.signedUrl, contentType });
}
