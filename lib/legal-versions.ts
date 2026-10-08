// 公開利用規約・プライバシーポリシーの版と有効期間。
//
// ファンの同意は「決済・会員登録の時点で表示されていた版」へのみなし同意なので、
// 決済ごとに版を記録せず、ここの有効期間から「その日時に有効だった版」を引く（versionAt）。
// 対面タッチ決済の購入は利用規約 第1条3項（2026-10-08c〜）によりみなし同意の対象外。
//
// effectiveFrom は「本番に表示された時点」（第11条：表示した時点から効力）。
// 過去の版は GitHub の Production デプロイ完了時刻を記録している。
// 新しい版は effectiveFrom: null（未施行）で追加し、main へ出すリリースPRで実際の
// 反映時刻を記入する。null のまま main 向けPRを出すと CI のテストで落ちる。
//
// 版を追加するときは既存エントリを書き換えず、末尾に追加すること（過去の版の本文は
// components/legal/terms/v<版>.tsx にそのまま残す）。

export type LegalVersion = {
  version: string;
  effectiveFrom: string | null; // ISO8601（UTC）。null = 未施行
  summary: string;
};

export const SERVICE_TERMS_VERSIONS: LegalVersion[] = [
  // 本番初リリース（PR #1）
  { version: '2026-06-27', effectiveFrom: '2026-06-27T07:13:17Z', summary: '初版' },
  // PR #138
  { version: '2026-10-08a', effectiveFrom: '2026-10-08T03:00:13Z', summary: '第9条（通信の秘密）・第10条（応援メッセージの取扱い）を新設' },
  // PR #139
  { version: '2026-10-08b', effectiveFrom: '2026-10-08T03:58:58Z', summary: '第8条（禁止事項）にメッセージ送信に関する禁止事項を追加' },
  { version: '2026-10-08c', effectiveFrom: null, summary: '第1条：同意の場面（会員登録・オンライン決済）と対面タッチ決済の扱いを明記' },
];

export const PRIVACY_POLICY_VERSIONS: LegalVersion[] = [
  // 本番初リリース（PR #1）時点から変更なし
  { version: '2026-03-24', effectiveFrom: '2026-06-27T07:13:17Z', summary: '初版' },
];

// 指定日時に有効だった版。最初の版より前、または未施行の版しか該当しない場合は null。
export function versionAt(versions: LegalVersion[], at: Date | string): LegalVersion | null {
  const t = new Date(at).getTime();
  let found: LegalVersion | null = null;
  for (const v of versions) {
    if (v.effectiveFrom === null) continue;
    if (new Date(v.effectiveFrom).getTime() <= t) found = v;
  }
  return found;
}

// 各版の有効期間。effectiveTo は次に施行された版の effectiveFrom（現行版は null）。
export function versionPeriods(versions: LegalVersion[]): (LegalVersion & { effectiveTo: string | null })[] {
  return versions.map((v, i) => {
    const next = versions.slice(i + 1).find((n) => n.effectiveFrom !== null);
    return { ...v, effectiveTo: v.effectiveFrom === null ? null : next?.effectiveFrom ?? null };
  });
}

// 表示用の現行版（末尾。未施行の版がある環境＝STG等ではそれを表示する）
export function latestVersion(versions: LegalVersion[]): LegalVersion {
  return versions[versions.length - 1];
}
