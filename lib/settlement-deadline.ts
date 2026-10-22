// 精算期限まわりの共通定数。auto-cancel-unsettled（自動取消）と evidence-request（証跡提出の催促）で使う。
// ヘルプ・チアリー(AI)の案内文もここから値を差し込む。
export const AUTH_EXPIRE_DAYS = 7;          // イベント開始からこの日数で未精算なら決済をすべて取り消し、イベントを中止扱いにする
export const AUTH_EXPIRE_WARN_DAYS_BEFORE = 2; // 期限のこの日数前に、未提出なら主催者へ催促・担当エージェント（自主催は admin）へフォロー依頼を出す（lib/evidence-request.ts）
