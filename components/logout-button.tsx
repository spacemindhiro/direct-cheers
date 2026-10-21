"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { clearAllConversations } from "@/lib/cheery/storage";

export function LogoutButton() {
  const router = useRouter();

  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    // チアリー(AI) の会話はこの端末にだけ保存している。同じ端末で次にログインする人に見せない
    clearAllConversations();
    router.push("/auth/login");
  };

  return <Button onClick={logout}>Logout</Button>;
}
