import { ScreenWakeLock } from "@/components/screen-wake-lock";

// 子機画面はエラー・読み込み中など、どの表示状態でも画面を点けたままにする
export default function DashboardDisplayLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ScreenWakeLock />
      {children}
    </>
  );
}
