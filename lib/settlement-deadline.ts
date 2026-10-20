// 精算期限まわりの共通定数。check-auth-expiry（警告）と auto-cancel-unsettled（自動取消）で
// 重複していたハードコードを集約する。ヘルプ・チアリー(AI)の案内文もここから値を差し込む。
export const AUTH_EXPIRE_DAYS = 7;          // イベント開始からこの日数で未精算なら決済をすべて取り消し、イベントを中止扱いにする
export const AUTH_EXPIRE_WARN_DAYS_BEFORE = 2; // 期限のこの日数前から担当エージェントへ警告通知を出す
