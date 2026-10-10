import { redirect } from "next/navigation";
import { TUTORIAL_VIDEO_IDS } from "@/lib/tutorial-videos";

// メールなど外部に貼る操作解説動画の固定リンク（/t/o-01 等）。
// 動画を撮り直してYouTube IDが変わっても、このURL自体は変わらない。
export default async function TutorialVideoRedirectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const id = TUTORIAL_VIDEO_IDS[slug.toLowerCase()];

  if (!id) redirect("/");

  redirect(`https://youtu.be/${id}`);
}
