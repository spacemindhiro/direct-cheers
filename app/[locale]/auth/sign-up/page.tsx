import { redirect } from "next/navigation";

// サインアップはログインページに統合されました
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams(params).toString();
  redirect(`/auth/login${qs ? `?${qs}` : ""}`);
}
