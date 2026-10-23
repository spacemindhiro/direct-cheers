// DC の MCP サーバーの「誰として動くか」。サーバーを作るときに本人を固定し、ツールの入力では変えられない
// （ツールに「誰のデータか」を指定する項目を持たせない＝どう頼まれても他人のデータを読むツールが存在しない）。
//
// 今は DC のサーバーの中だけでつなぐ（チアリー(AI) の応答API）。将来 HTTP の入口を足して外部のAIアプリに
// 開く場合も、ここに本人を入れる手前（認証）を足すだけにする。そのためツールは呼び出し元を信用せず、
// 本人が画面で見られる範囲だけを、外に出してよい項目だけで返すこと。
import type { SupabaseClient } from "@supabase/supabase-js";

export type DcMcpContext = {
  userId: string;
  email: string | null;
  role: string;                 // profiles.role（サーバーで読んだもの）
  supabase: SupabaseClient;     // 本人のセッションのクライアント（RLS が効く）
  admin: SupabaseClient;        // service_role。本人に見せてよいと確かめた範囲の集計にだけ使う
  // ダッシュボードのパスキー確認（dc_stepup、24時間）が済んでいるか。照会検索（出演者を探す）の条件
  stepUpFresh?: boolean;
  // chat：AI との会話（読み取りのツールだけ）。action：本人が確認カードのボタンを押したとき（書き込みのツールも出す）。
  // 書き込みのツールは AI に渡さない（p5-design.md 3章）。action は /api/cheery/action だけが付ける
  mode?: "chat" | "action";
  // この会話で本人が書いた文（chat だけ。端末から毎回送られてくる履歴の、本人の発言）。
  // QR のラベルのように「本人の言葉そのまま」でなければならない項目を、AI が考えた文字で埋めないための確認に使う
  userTexts?: string[];
  now?: Date;
};
