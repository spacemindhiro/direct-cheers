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
 * - entrance（入場券）・recipientNameContext='organizer': 主催者名を使う（MoRが常にオーガナイザーのため）
 * - recipientNameContext='artist': 演者名を使う
 *
 * account-level の固定ベース（"DC" のみ。オンボーディング時の事業者名は
 * このsuffixとは無関係の別の値）と、ここで選ぶ名前との間に重複は無い。
 * イベント名は使わない（英語表記と同じ情報量に揃える）。
 */
export function resolveStatementDescriptorSource(params: {
  isEntrance: boolean;
  recipientNameContext: RecipientNameContext;
  organizerName?: string | null;
  artistName?: string | null;
  recipientDisplayName?: string | null;
}): string | null {
  const { isEntrance, recipientNameContext, organizerName, artistName, recipientDisplayName } = params;

  if (isEntrance || recipientNameContext === "organizer") {
    return organizerName ?? recipientDisplayName ?? null;
  }
  return artistName ?? recipientDisplayName ?? null;
}

/**
 * 決済の宛先名義から、表示すべきアバター画像URLを選ぶ。resolveStatementDescriptorSource
 * と同じ「誰の名義か」のルールを画像にも適用する（名前だけ区別してアバターが
 * 昔のままだと、ウォレットカード等で名前と画像が一致しない人物に見えてしまう）。
 * 主催者がDJ等を兼任していて、主催者用とアーティスト用で別の画像を設定している場合に
 * 正しい方を選ぶために使う。どちらも未設定なら共通のavatar_urlにフォールバックする。
 */
export function resolveRecipientAvatarUrl(params: {
  isEntrance: boolean;
  recipientNameContext: RecipientNameContext;
  organizerAvatarUrl?: string | null;
  artistAvatarUrl?: string | null;
  recipientAvatarUrl?: string | null;
}): string | null {
  const { isEntrance, recipientNameContext, organizerAvatarUrl, artistAvatarUrl, recipientAvatarUrl } = params;

  if (isEntrance || recipientNameContext === "organizer") {
    return organizerAvatarUrl ?? recipientAvatarUrl ?? null;
  }
  return artistAvatarUrl ?? recipientAvatarUrl ?? null;
}

/**
 * チアカード（Apple Wallet・コレクション画面）が共通して必要とする
 * 「表示名 + 画像」の解決をまとめて行う。
 *
 * 優先順位:
 *   1. QR宛先（recipient）が居れば、recipient_name_contextに応じて
 *      organizer_name/organizer_avatar_url または artist_name/artist_avatar_url
 *      （resolveStatementDescriptorSource / resolveRecipientAvatarUrl と同一ルール）
 *   2. 宛先が解決できない場合、商品に紐づくアーティスト（product.artist）
 *   3. どちらも無ければ fallbackName（既定 "Artist"）・画像はnull
 *
 * イベント名（event.title/name）はどの優先順位にも含まれない
 * （statement_descriptor同様、英語表記と同じ情報量に揃えるため使わない）。
 */
export function resolveCheerCardIdentity(params: {
  recipientNameContext: RecipientNameContext;
  recipient?: {
    organizerName?: string | null;
    artistName?: string | null;
    displayName?: string | null;
    organizerAvatarUrl?: string | null;
    artistAvatarUrl?: string | null;
    avatarUrl?: string | null;
  } | null;
  productArtist?: {
    artistName?: string | null;
    displayName?: string | null;
    avatarUrl?: string | null;
  } | null;
  fallbackName?: string;
}): { name: string; avatarUrl: string | null } {
  const { recipientNameContext, recipient, productArtist, fallbackName = "Artist" } = params;

  const resolvedName = recipient
    ? resolveStatementDescriptorSource({
        isEntrance: false,
        recipientNameContext,
        organizerName: recipient.organizerName,
        artistName: recipient.artistName,
        recipientDisplayName: recipient.displayName,
      })
    : null;

  const resolvedAvatar = recipient
    ? resolveRecipientAvatarUrl({
        isEntrance: false,
        recipientNameContext,
        organizerAvatarUrl: recipient.organizerAvatarUrl,
        artistAvatarUrl: recipient.artistAvatarUrl,
        recipientAvatarUrl: recipient.avatarUrl,
      })
    : null;

  return {
    name: resolvedName ?? productArtist?.artistName ?? productArtist?.displayName ?? fallbackName,
    avatarUrl: resolvedAvatar ?? productArtist?.avatarUrl ?? null,
  };
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
 *
 * organizerNameAscii/artistNameAsciiが指定されていれば、ASCII版（suffix）だけ
 * それを優先して使う（kana/kanji版は常にorganizerName/artistNameから生成）。
 * 漢字名の場合にASCII版が空になり海外発行カードで明細なしになる問題への対応。
 */
export function buildStatementDescriptorSuffixes(
  params: Parameters<typeof resolveStatementDescriptorSource>[0] & {
    organizerNameAscii?: string | null;
    artistNameAscii?: string | null;
  },
): StatementDescriptorSuffixes {
  const source = resolveStatementDescriptorSource(params);
  if (!source) return {};

  const asciiOverrideSource = resolveStatementDescriptorSource({
    isEntrance: params.isEntrance,
    recipientNameContext: params.recipientNameContext,
    organizerName: params.organizerNameAscii?.trim() || null,
    artistName: params.artistNameAscii?.trim() || null,
    recipientDisplayName: null,
  });

  return {
    suffix: sanitizeStatementDescriptorSuffix(asciiOverrideSource ?? source, 19) ?? undefined,
    suffixKana: sanitizeStatementDescriptorSuffixKana(source, 22) ?? undefined,
    suffixKanji: sanitizeStatementDescriptorSuffixKanji(source, 17) ?? undefined,
  };
}

// ============================================================================
// ベース表記（account-level prefix）の制御
//
// account-levelのベース表記は、オーガナイザーによるカスタマイズを一切許可せず
// 常に固定文字列 "DC for"（Direct Cheers）とする。事業者名から可変のベースを
// 組み立てる仕組みは廃止した（自由文字列を許すと動的suffixと結合した際に
// 意味不明な明細になりチャージバックの原因になる上、「ベース＋suffix」以外の
// 第三の可変要素を増やすこと自体が混乱の元になるため）。
//
// Stripeの合計文字数制限（prefix + 区切り + suffix の合計）:
//   ASCII: 22文字 / カナ: 22文字 / 漢字: 17文字
// 超過した場合、Stripeはベース（prefix）側を切り詰めてsuffixを優先表示する
// （公式ドキュメントの記載に基づく）。
//
// 元は"DC"（2文字）固定だったが、Stripe Connectアカウント作成時の
// statement_descriptorには「単体で5文字以上」という別の検証があり、本番で
// 口座登録が完全にブロックされる障害が発生したため、6文字の"DC for"に変更。
export const PLATFORM_PREFIX = "DC for";

const ASCII_TOTAL_MAX = 22;
const KANA_TOTAL_MAX = 22;
const KANJI_TOTAL_MAX = 17;

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

  // 超過分だけprefixを切り詰める（suffixは満額表示を優先）。
  // 単語の途中で切れると「DC Spa Space Mind」のような意味不明な表記になるため、
  // 切り詰め位置が単語の境界（直前が空白、または末尾）でなければ、
  // 直前の空白まで戻ってから足す（単語の断片を残さない）。
  const allowedPrefixLen = Math.max(0, totalMax - separator.length - safeSuffix.length);
  const rawSlice = prefix.slice(0, allowedPrefixLen);
  const nextChar = prefix[allowedPrefixLen];
  const cutsCleanly =
    allowedPrefixLen >= prefix.length || rawSlice.length === 0 || rawSlice.endsWith(" ") || nextChar === " ";
  let truncatedPrefix = rawSlice.trim();
  if (!cutsCleanly) {
    // 単語の境界（空白）が無い場合（1単語が丸ごと長い等）は、
    // 戻る先が無いので素直に切り詰める（何も表示しないよりは良い）。
    const lastSpace = truncatedPrefix.lastIndexOf(" ");
    if (lastSpace > 0) {
      truncatedPrefix = truncatedPrefix.slice(0, lastSpace).trim();
    }
  }
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
