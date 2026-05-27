import { redirect } from "next/navigation";

// サインアップはログインページに統合されました
export default function Page() {
  redirect("/auth/login");
}
