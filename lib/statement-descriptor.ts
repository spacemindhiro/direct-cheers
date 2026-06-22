/**
 * Stripe statement_descriptor_suffix（カード明細書の動的追記）を
 * 決済の宛先名義（オーガナイザー/演者）から組み立てる。
 *
 * Stripeには3種類のsuffixフィールドがあり、用途が異なる:
 * - statement_descriptor_suffix（ASCII）: 半角英数字+一部記号のみ。22文字以内。
 *   payment_intent_data 直下に置く。
 * - statement_descriptor_suffix_kana: カナのみ。22文字以内。
 *   payment_method_options.card 配下に置く。アカウント側に登録済みのカナ
 *   ベース表記（オンボーディング時に設定）と連結される。
 * - statement_descriptor_suffix_kanji: 漢字・かな・英数字混在可。17文字以内。
 *   payment_method_options.card 配下に置く。アカウント側の漢字ベース表記と連結される。
 *
 * 日本の発行会社のカードは通常カナ/漢字の明細を表示するため、artist_name/
 * organizer_name/イベント名が日本語の場合、ASCII版だけでは画面に何も
 * 反映されない。3種類すべてを同じ名前から生成し、該当しない文字種は
 * 除去した結果が空になれば undefined（フィールド自体を省略）にする。
 */

export type RecipientNameContext = "organizer" | "artist";

const ALLOWED_CHARS_REGEX = /[^A-Z0-9.,\- ]/g;
// 漢字・ひらがな・カタカナ・半角全角英数字・基本記号を許可（Stripeの漢字フィールドは比較的広く受け付ける）
const KANJI_ALLOWED_REGEX = /[^0-9A-Za-zぁ-んァ-ヶー一-龠０-９Ａ-Ｚａ-ｚ.,\- 　]/g;
// カナフィールドは全角カタカナ・数字・基本記号のみ（Stripeのカナフィールド規約に準拠）
const KANA_ALLOWED_REGEX = /[^ァ-ー０-９0-9\s\-.]/g;

/** 全角英数字を半角に変換する（全角記号・かな漢字は対象外） */
function toHalfWidthAlnum(input: string): string {
  return input.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0),
  );
}

/**
 * 任意の文字列をStripe statement_descriptor_suffix用に整形する。
 * 半角英数大文字 + ". , - 空白" のみ残し、maxLen文字に切り詰める。
 * サニタイズ後に空になった場合は null を返す（呼び出し側でsuffix自体を省略する）。
 */
export function sanitizeStatementDescriptorSuffix(
  raw: string | null | undefined,
  maxLen = 19,
): string | null {
  if (!raw) return null;
  const halfWidth = toHalfWidthAlnum(raw);
  const upper = halfWidth.toUpperCase();
  const cleaned = upper.replace(ALLOWED_CHARS_REGEX, "");
  const collapsed = cleaned.replace(/\s+/g, " ").trim();
  const truncated = collapsed.slice(0, maxLen).trim();
  return truncated.length > 0 ? truncated : null;
}

/** ひらがなをカタカナに変換する（カナフィールド用） */
function toKatakana(input: string): string {
  return input.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
}

/**
 * statement_descriptor_suffix_kanji 用に整形する。
 * 漢字・かな・英数字・基本記号を残し、17文字以内に切り詰める。
 * アカウント側の漢字ベース表記（オンボーディング時に登録）と連結されるフィールド。
 */
export function sanitizeStatementDescriptorSuffixKanji(
  raw: string | null | undefined,
  maxLen = 17,
): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(KANJI_ALLOWED_REGEX, "");
  const collapsed = cleaned.replace(/[\s　]+/g, " ").trim();
  const truncated = collapsed.slice(0, maxLen).trim();
  return truncated.length > 0 ? truncated : null;
}

/**
 * statement_descriptor_suffix_kana 用に整形する。
 * ひらがなはカタカナに変換し、カタカナ・数字・基本記号のみを残し、22文字以内に切り詰める。
 * アカウント側のカナベース表記（オンボーディング時に登録）と連結されるフィールド。
 * ローマ字のみの名前（例: "DJ HIRO"）はカタカナ要素が無いため null になる。
 */
export function sanitizeStatementDescriptorSuffixKana(
  raw: string | null | undefined,
  maxLen = 22,
): string | null {
  if (!raw) return null;
  const katakana = toKatakana(raw);
  const cleaned = katakana.replace(KANA_ALLOWED_REGEX, "");
  const collapsed = cleaned.replace(/\s+/g, " ").trim();
  const truncated = collapsed.slice(0, maxLen).trim();
  return truncated.length > 0 ? truncated : null;
}

/**
 * 決済の宛先名義から、statement_descriptor_suffix の元になる「生の名前」を選ぶ。
 * - entrance（入場券）・recipientNameContext='organizer': 主催者名を使う
 * - recipientNameContext='artist': 演者名を使う
 *
 * イベント名は使わない。漢字版は17文字・カナ版は22文字しかなく、
 * 既にprefix（DC-主催者名）で大半を使い切るため、suffixにイベント名まで
 * 詰め込もうとすると確実に文字数があふれて意味不明な表記になる
 * （ASCII表記と同じ情報量に揃え、無理に増やさない）。
 * prefix側に同じ名前が既に出ていても、英語表記でも同様の重複を許容しており
 * 一貫性を優先する。
 */
export function resolveStatementDescriptorSource(params: {
  isEntrance: boolean;
  recipientNameContext: RecipientNameContext;
  organizerName?: string | null;
  artistName?: string | null;
  recipientDisplayName?: string | null;
}): string | null {
  const { isEntrance, recipientNameContext, organizerName, artistName, recipientDisplayName } = params;

  // 入場券のMoRは常にオーガナイザーなので、主催者名義の決済と同様に扱う
  if (isEntrance || recipientNameContext === "organizer") {
    return organizerName ?? recipientDisplayName ?? null;
  }
  return artistName ?? recipientDisplayName ?? null;
}

/**
 * 名前解決 + サニタイズをまとめて行う。Stripeのパラメータに渡す際は
 * `statement_descriptor_suffix: buildStatementDescriptorSuffix(...) ?? undefined`
 * のように使い、undefined ならフィールド自体を渡さない。
 */
export function buildStatementDescriptorSuffix(
  params: Parameters<typeof resolveStatementDescriptorSource>[0],
  maxLen = 19,
): string | undefined {
  const source = resolveStatementDescriptorSource(params);
  if (!source) return undefined;
  return sanitizeStatementDescriptorSuffix(source, maxLen) ?? undefined;
}

export type StatementDescriptorSuffixes = {
  /** payment_intent_data.statement_descriptor_suffix （ASCII、ローマ字名のみ反映される） */
  suffix?: string;
  /** payment_method_options.card.statement_descriptor_suffix_kana （カタカナ名のみ反映される） */
  suffixKana?: string;
  /** payment_method_options.card.statement_descriptor_suffix_kanji （漢字・かな・英数字混在可） */
  suffixKanji?: string;
};

/**
 * 名前解決 + ASCII/カナ/漢字3種のサニタイズをまとめて行う。
 * 日本語名前の場合、ASCII版は空（undefined）になり、kanji版（場合によりkana版も）に
 * 反映される。3種とも独立して判定するため、呼び出し側は該当するフィールドにそれぞれ渡す。
 */
export function buildStatementDescriptorSuffixes(
  params: Parameters<typeof resolveStatementDescriptorSource>[0],
): StatementDescriptorSuffixes {
  const source = resolveStatementDescriptorSource(params);
  if (!source) return {};
  return {
    suffix: sanitizeStatementDescriptorSuffix(source, 19) ?? undefined,
    suffixKana: sanitizeStatementDescriptorSuffixKana(source, 22) ?? undefined,
    suffixKanji: sanitizeStatementDescriptorSuffixKanji(source, 17) ?? undefined,
  };
}

// ============================================================================
// ベース表記（account-level prefix）の制御
//
// オーガナイザーがオンボーディング時に自由文字列を入れると、動的suffixと結合した
// 際にカード明細が意味不明な文字列になり、チャージバックの原因になる。
// Stripeにはこの「ベース」+「毎回変わるsuffix」を結合する専用フィールドが
// 用意されている（statement_descriptor_prefix / _kana / _kanji）。
// このプロジェクトでは prefix の先頭を必ず "DC-"（Direct Cheers）で固定し、
// 残りをオーガナイザー名から生成することで、ベース表記の自由度を奪い
// 「身元が常に分かる」状態を保証する。
//
// Stripeの合計文字数制限（prefix + 区切り + suffix の合計）:
//   ASCII: 22文字 / カナ: 22文字 / 漢字: 17文字
// 超過した場合、Stripeはベース（prefix）側を切り詰めてsuffixを優先表示する
// （公式ドキュメントの記載に基づく。本ファイルのプレビュー用シミュレーションも
// これに合わせてprefix側を切り詰める）。
// ============================================================================

/** ASCII版・漢字版で使う固定プラットフォーム識別子。"DC" = Direct Cheers。 */
export const PLATFORM_PREFIX = "DC";

const ASCII_TOTAL_MAX = 22;
const KANA_TOTAL_MAX = 22;
const KANJI_TOTAL_MAX = 17;

export type StatementDescriptorPrefixes = {
  /** statement_descriptor / statement_descriptor_prefix （ASCII。常に "DC-" で始まる） */
  prefix: string;
  /**
   * statement_descriptor_kana / statement_descriptor_prefix_kana
   * カナフィールドは半角英字を受け付けないため "DC" マーカーは付与できない。
   * オーガナイザー名のカナ変換結果のみ（無ければ undefined）。
   */
  prefixKana?: string;
  /** statement_descriptor_kanji / statement_descriptor_prefix_kanji （常に "DC " または "DC" で始まる） */
  prefixKanji: string;
};

/**
 * オーガナイザー名から、システム固定の "DC-" を冠したベース表記（prefix）を組み立てる。
 * suffix用の文字数を残すため、prefix自体の上限はsuffixより短く設定する
 * （ASCII: DC- + 12文字まで、漢字: DC + 10文字まで）。
 *
 * 漢字・カナは別々の入力フィールド（オンボーディングフォームの「漢字」「カナ」欄）から
 * 来る別々の文字列であり、1つの文字列に潰すと片方のフィールドの内容が無視される
 * バグになるため、3種それぞれ専用のソース文字列を受け取る。
 */
export function buildStatementDescriptorPrefixes(sources: {
  /** ASCII prefix の元データ（ローマ字表記。例: business_name や display_name） */
  asciiNameRaw?: string | null;
  /** statement_descriptor_kana 入力欄の値 */
  kanaNameRaw?: string | null;
  /** statement_descriptor_kanji 入力欄の値 */
  kanjiNameRaw?: string | null;
}): StatementDescriptorPrefixes {
  const asciiName = sanitizeStatementDescriptorSuffix(sources.asciiNameRaw, 12);
  const prefix = asciiName ? `${PLATFORM_PREFIX}-${asciiName}` : PLATFORM_PREFIX;

  const kanjiName = sanitizeStatementDescriptorSuffixKanji(sources.kanjiNameRaw, 10);
  const prefixKanji = kanjiName ? `${PLATFORM_PREFIX} ${kanjiName}` : PLATFORM_PREFIX;

  // カナフィールドは "DC" を表現できないため、オーガナイザー名のカナのみ
  // （無ければprefix自体を省略 = アカウント側の素のkana設定に委ねる）
  const prefixKana = sanitizeStatementDescriptorSuffixKana(sources.kanaNameRaw, KANA_TOTAL_MAX) ?? undefined;

  return { prefix, prefixKana, prefixKanji };
}

/**
 * prefix + suffix を結合した最終的な明細表記をシミュレーションする（プレビュー表示用）。
 * Stripeは合計が上限を超えた場合、prefix側を切り詰めてsuffixを優先表示するため、
 * その挙動を再現する。実際にStripeへ送るパラメータの計算には使わない
 * （Stripe側が最終的な結合・切り詰めを行うため）。
 */
export function combineDescriptorPreview(
  prefix: string,
  suffix: string | null | undefined,
  totalMax: number,
): { combined: string; truncated: boolean } {
  const safeSuffix = suffix?.trim() ?? "";
  if (!safeSuffix) return { combined: prefix, truncated: false };

  const separator = " ";
  const fullLength = prefix.length + separator.length + safeSuffix.length;
  if (fullLength <= totalMax) {
    return { combined: `${prefix}${separator}${safeSuffix}`, truncated: false };
  }

  // 超過分だけprefixを切り詰める（suffixは満額表示を優先）
  const allowedPrefixLen = Math.max(0, totalMax - separator.length - safeSuffix.length);
  const truncatedPrefix = prefix.slice(0, allowedPrefixLen);
  const combined = truncatedPrefix
    ? `${truncatedPrefix}${separator}${safeSuffix}`
    : safeSuffix.slice(0, totalMax);
  return { combined, truncated: true };
}

export const STATEMENT_DESCRIPTOR_TOTAL_MAX = {
  ascii: ASCII_TOTAL_MAX,
  kana: KANA_TOTAL_MAX,
  kanji: KANJI_TOTAL_MAX,
} as const;
