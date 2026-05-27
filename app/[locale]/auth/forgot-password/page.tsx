import { redirect } from "next/navigation";

// パスワードレス移行のためログインページへリダイレクト
export default function Page() {
  redirect("/auth/login");
}
