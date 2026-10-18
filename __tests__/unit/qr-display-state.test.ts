/**
 * TC-QDS: lib/qr-display-state.ts のユニットテスト
 *
 * 子機（qr-board-display）のタイムテーブル表示と、親機（qr-control-panel）の強制表示は
 * どちらも qrConfigToDisplayState で表示状態を組み立てる。グループ一覧のタイル画像は
 * artist_avatar_url に入り、宛先名義に応じて
 *   出演者名義: アー写 → 共通アバター → 商品アーティストの写真
 *   主催者名義: 主催者写真 → 共通アバター → 商品アーティストの写真
 * の順で解決する。QR個別画像(image_url)はエントランス・カスタムのみ最優先。
 */
import { describe, it, expect } from "vitest";
import { qrConfigToDisplayState, type QrConfigForDisplay } from "@/lib/qr-display-state";

const SITE = "https://example.test";
const ARTIST_AV = "https://img.test/artist.png";
const ORG_AV = "https://img.test/organizer.png";
const COMMON_AV = "https://img.test/common.png";
const PRODUCT_AV = "https://img.test/product-artist.png";
const QR_IMG = "https://img.test/qr.png";

function makeConfig(overrides: Partial<QrConfigForDisplay> = {}): QrConfigForDisplay {
  return {
    qr_config_id: "qc-1",
    label: "猫Dashへ投げ銭",
    image_url: QR_IMG,
    recipient_name_context: "artist",
    product: {
      name: "投げ銭",
      type: "standard",
      artist: { display_name: "商品表示名", artist_name: "商品アーティスト", avatar_url: PRODUCT_AV },
    },
    recipient: {
      display_name: "宛先表示名",
      avatar_url: COMMON_AV,
      artist_name: "Neko Dash",
      organizer_name: "Kawasaki Shuukai",
      artist_avatar_url: ARTIST_AV,
      organizer_avatar_url: ORG_AV,
    },
    ...overrides,
  };
}

describe("TC-QDS: qrConfigToDisplayState", () => {
  it("TC-QDS-01: nullならnull", () => {
    expect(qrConfigToDisplayState(null, SITE)).toBe(null);
  });

  it("TC-QDS-02: 出演者名義はアー写を最優先し、URL・名前・ラベルも組み立てる", () => {
    const qc = makeConfig();
    expect(qrConfigToDisplayState(qc, SITE)).toEqual({
      qr_config_id: qc.qr_config_id,
      qr_url: `${SITE}/c/${qc.qr_config_id}`,
      product_name: qc.product!.name,
      label: qc.label,
      artist_name: qc.recipient!.artist_name,
      artist_avatar_url: ARTIST_AV,
    });
  });

  it("TC-QDS-03: 出演者名義でアー写が無ければ共通アバター", () => {
    const qc = makeConfig({ recipient: { ...makeConfig().recipient!, artist_avatar_url: null } });
    expect(qrConfigToDisplayState(qc, SITE)!.artist_avatar_url).toBe(COMMON_AV);
  });

  it("TC-QDS-04: 宛先の写真が全て無ければ商品アーティストの写真", () => {
    const qc = makeConfig({
      recipient: { ...makeConfig().recipient!, artist_avatar_url: null, organizer_avatar_url: null, avatar_url: null },
    });
    expect(qrConfigToDisplayState(qc, SITE)!.artist_avatar_url).toBe(PRODUCT_AV);
  });

  it("TC-QDS-05: どこにも写真が無ければnull（支援QRではQR個別画像を使わない）", () => {
    const qc = makeConfig({
      recipient: { ...makeConfig().recipient!, artist_avatar_url: null, organizer_avatar_url: null, avatar_url: null },
      product: { name: "投げ銭", type: "message", artist: null },
    });
    const state = qrConfigToDisplayState(qc, SITE)!;
    expect(state.artist_avatar_url).toBe(null);
    expect(state.artist_name).toBe(qc.recipient!.artist_name);
  });

  it("TC-QDS-06: 主催者名義は主催者写真・主催者名（アー写があっても使わない）", () => {
    const qc = makeConfig({ recipient_name_context: "organizer" });
    const state = qrConfigToDisplayState(qc, SITE)!;
    expect(state.artist_avatar_url).toBe(ORG_AV);
    expect(state.artist_name).toBe(qc.recipient!.organizer_name);
  });

  it("TC-QDS-07: 主催者名義で主催者写真が無ければ共通アバター（アー写には落ちない）", () => {
    const qc = makeConfig({
      recipient_name_context: "organizer",
      recipient: { ...makeConfig().recipient!, organizer_avatar_url: null },
    });
    expect(qrConfigToDisplayState(qc, SITE)!.artist_avatar_url).toBe(COMMON_AV);
  });

  it("TC-QDS-08: エントランス・カスタムはQR個別画像を最優先", () => {
    for (const type of ["entrance", "custom"]) {
      const qc = makeConfig({ product: { ...makeConfig().product!, type } });
      expect(qrConfigToDisplayState(qc, SITE)!.artist_avatar_url).toBe(QR_IMG);
    }
  });

  it("TC-QDS-09: エントランスでもQR個別画像が無ければ宛先の写真", () => {
    const qc = makeConfig({ image_url: null, product: { ...makeConfig().product!, type: "entrance" } });
    expect(qrConfigToDisplayState(qc, SITE)!.artist_avatar_url).toBe(ARTIST_AV);
  });

  it("TC-QDS-10: 宛先が無ければ商品アーティストの名前と写真", () => {
    const qc = makeConfig({ recipient: null });
    const state = qrConfigToDisplayState(qc, SITE)!;
    expect(state.artist_name).toBe(qc.product!.artist!.artist_name);
    expect(state.artist_avatar_url).toBe(PRODUCT_AV);
  });

  it("TC-QDS-11: ラベルは上書き指定 → QRのラベル → 商品名の順", () => {
    const qc = makeConfig();
    expect(qrConfigToDisplayState(qc, SITE, "上書き")!.label).toBe("上書き");
    expect(qrConfigToDisplayState(makeConfig({ label: null }), SITE)!.label).toBe(qc.product!.name);
  });
});
