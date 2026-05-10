export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;

  const manifest = {
    name: "Direct Cheers Display",
    short_name: "DC Display",
    id: `/display/${eventId}/`,
    scope: "/",
    start_url: `/display/${eventId}/`,
    display: "standalone",
    background_color: "#020617",
    theme_color: "#020617",
    orientation: "landscape",
    icons: [
      {
        src: "/logo-emblem.png",
        sizes: "314x279",
        type: "image/png",
        purpose: "any",
      },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
