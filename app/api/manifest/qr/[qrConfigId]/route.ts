export async function GET(
  _req: Request,
  { params }: { params: Promise<{ qrConfigId: string }> }
) {
  const { qrConfigId } = await params;

  const manifest = {
    name: "Direct Cheers",
    short_name: "Direct Cheers",
    id: `/c/${qrConfigId}/`,
    scope: "/",
    start_url: `/c/${qrConfigId}/`,
    display: "standalone",
    background_color: "#020617",
    theme_color: "#020617",
    orientation: "portrait",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
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
