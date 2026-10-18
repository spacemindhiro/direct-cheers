import { ScreenWakeLock } from "@/components/screen-wake-lock";

// 子機画面はログイン切れ・エラー・読み込み中など、どの表示状態でも画面を点けたままにする
export default function DisplayLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ScreenWakeLock />
      {children}
    </>
  );
}
