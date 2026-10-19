"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

// 規約バージョンが上がった際、デジタル未同意のユーザーを/dashboard/termsへ
// 誘導する。サーバーコンポーネント(DashboardNav)のSuspense配下でredirect()を
// 呼ぶと、Next.jsがmeta refreshタグによる疑似リダイレクトを行い、リダイレクト
// 先ページでx-pathnameヘッダーが正しく再取得できず自己リダイレクトの無限
// ループになることを実測で確認したため、bank-setupと同じクライアント側の
// fetch + router.replace方式に統一する(usePathname()は常に正確なため安全)。
export function TermsGate() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (pathname.includes("/dashboard/terms")) return;

    let cancelled = false;
    fetch("/api/terms/status")
      .then((r) => r.json())
      .then((data: { allAgreed?: boolean; status?: Record<string, { required: boolean; digitallySigned: boolean }> }) => {
        if (cancelled || !data.status) return;
        const hasPendingDigitalSignature = Object.values(data.status).some(
          (s) => s.required && !s.digitallySigned,
        );
        if (hasPendingDigitalSignature) {
          router.replace(`/dashboard/terms?next=${encodeURIComponent(pathname)}`);
        }
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [pathname, router]);

  return null;
}
