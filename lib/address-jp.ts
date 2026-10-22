// 日本の住所の整形と、郵便番号との照合。Google から取った住所を、会場マスタの項目（郵便番号・都道府県・市区町村・町名・番地）に分ける。
// 郵便番号の住所は、作成画面の郵便番号検索（app/api/zip-search）と同じ postcode.teraren.com から引く。

export type ZipArea = { prefecture: string; city: string; suburb: string };

export type VenueAddress = { postal_code: string; prefecture: string; city: string; town: string | null; line1: string };

export type SplitResult =
  | { ok: true; address: VenueAddress }
  | { ok: false; reason: "no_postal" | "zip_unknown" | "mismatch" | "no_line1" };

type Fetch = typeof fetch;

// 7桁の数字だけにする（"150-0041"・"〒150-0041"・全角も受け付ける）。7桁でなければ null
export function normalizePostal(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").normalize("NFKC").replace(/\D/g, "");
  return digits.length === 7 ? digits : null;
}

export async function lookupZip(postal7: string, opts: { fetch?: Fetch } = {}): Promise<ZipArea | null> {
  const res = await (opts.fetch ?? fetch)(`https://postcode.teraren.com/postcodes/${postal7}.json`, {
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return null;
  const d = (await res.json()) as { prefecture?: string; city?: string; suburb?: string | null };
  if (!d.prefecture || !d.city) return null;
  return { prefecture: d.prefecture, city: d.city, suburb: d.suburb ?? "" };
}

// Google の住所の表記を揃える（全角の数字・記号を半角に、数字の間の長音・ダッシュ類をハイフンに、国名・郵便番号・空白を外す）
export function cleanFormatted(formatted: string): string {
  return formatted
    .normalize("NFKC")
    .replace(/^日本[、,\s]*/, "")
    .replace(/〒?\s*\d{3}-?\d{4}/, "")
    .replace(/(\d)[−ー‐―–—](?=\d)/g, "$1-")
    .replace(/\s+/g, "")
    .trim();
}

// Google の住所を、郵便番号の住所と照らし合わせて分ける。
// 都道府県＋市区町村が郵便番号の住所と一致しないものは「合わない」として登録に進ませない。
// allowEmptyLine1：ピンの位置から引いた住所は番地が無いことが多い（山の中など）ので、番地を空のまま返し、カードで目印を入れてもらう
export function splitAddress(formatted: string, postalRaw: string | null, zip: ZipArea | null, opts: { allowEmptyLine1?: boolean } = {}): SplitResult {
  const postal = normalizePostal(postalRaw);
  if (!postal) return { ok: false, reason: "no_postal" };
  if (!zip) return { ok: false, reason: "zip_unknown" };
  const cleaned = cleanFormatted(formatted);
  const head = `${zip.prefecture}${zip.city}`;
  if (!cleaned.startsWith(head)) return { ok: false, reason: "mismatch" };
  let rest = cleaned.slice(head.length);
  // 郵便番号の町名が「以下に掲載がない場合」等のときは町名を使わない
  const suburb = /掲載がない|一円/.test(zip.suburb) ? "" : zip.suburb;
  let town: string | null = null;
  if (suburb && rest.startsWith(suburb)) {
    town = suburb;
    rest = rest.slice(suburb.length);
  }
  const line1 = rest.trim();
  if (!line1 && !opts.allowEmptyLine1) return { ok: false, reason: "no_line1" };
  return {
    ok: true,
    address: { postal_code: `${postal.slice(0, 3)}-${postal.slice(3)}`, prefecture: zip.prefecture, city: zip.city, town, line1 },
  };
}
