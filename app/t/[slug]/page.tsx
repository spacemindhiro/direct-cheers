import { Suspense } from "react";
import { redirect } from "next/navigation";
import { TUTORIAL_VIDEO_IDS } from "@/lib/tutorial-videos";

// メールなど外部に貼る操作解説動画の固定リンク（/t/o-01 等）。
// 動画を撮り直してYouTube IDが変わっても、このURL自体は変わらない。
async function TutorialVideoRedirectContent({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<never> {
  const { slug } = await params;
  const id = TUTORIAL_VIDEO_IDS[slug.toLowerCase()];

  if (!id) redirect("/");

  redirect(`https://youtu.be/${id}`);
}

export default function TutorialVideoRedirectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <TutorialVideoRedirectContent params={params} />
    </Suspense>
  );
}
