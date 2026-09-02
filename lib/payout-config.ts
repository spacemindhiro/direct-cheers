// 出金まわりの共通定数。route.ts / payout page / payout-form で重複していたハードコードを集約する。
export const HOLD_DAYS = 14;        // 出金可能になるまでの日数
export const FEE_WAIVER_DAYS = 120; // これを超えて経過した分はチャージバックリスクが極小化するため振込手数料を免除する
export const TRANSFER_FEE = 500;    // 振込手数料（無料枠の出金には適用しない）
