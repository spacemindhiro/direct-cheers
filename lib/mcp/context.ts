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
  now?: Date;
};
