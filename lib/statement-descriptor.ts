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
 * - entrance（入場券）: 宛先がオーガナイザー個人かどうかに関わらず、常にイベント名を使う
 * - それ以外（チア/メッセージ）: qr_configs.recipient_name_context に従い
 *   organizer_name または artist_name を使う（無ければ display_name → イベント名 にフォールバック）
 */
export function resolveStatementDescriptorSource(params: {
  isEntrance: boolean;
  eventTitle?: string | null;
  recipientNameContext: RecipientNameContext;
  organizerName?: string | null;
  artistName?: string | null;
  recipientDisplayName?: string | null;
}): string {
  const {
    isEntrance, eventTitle, recipientNameContext,
    organizerName, artistName, recipientDisplayName,
  } = params;

  if (isEntrance) {
    return eventTitle ?? recipientDisplayName ?? "DIRECT CHEERS";
  }
  if (recipientNameContext === "organizer") {
    return organizerName ?? recipientDisplayName ?? eventTitle ?? "DIRECT CHEERS";
  }
  return artistName ?? recipientDisplayName ?? eventTitle ?? "DIRECT CHEERS";
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
  return {
    suffix: sanitizeStatementDescriptorSuffix(source, 19) ?? undefined,
    suffixKana: sanitizeStatementDescriptorSuffixKana(source, 22) ?? undefined,
    suffixKanji: sanitizeStatementDescriptorSuffixKanji(source, 17) ?? undefined,
  };
}
