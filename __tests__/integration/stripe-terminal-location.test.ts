/**
 * TC-VENUE-LOCATION: resolveTerminalLocationId（会場→Stripe Terminal Locationの遅延作成）の統合テスト
 *
 * カバレッジ:
 *   A. stripe_terminal_location_id未設定の会場 → Stripe Location作成 + venuesテーブルへキャッシュ
 *   B. 既にstripe_terminal_location_idがある会場 → Stripe APIを呼ばずそのまま返す
 *   C. 存在しないvenue_id → null
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "crypto";
import { insertProfile, deleteAuthUsers } from "../helpers/seed";
import { testAdmin } from "../helpers/db-reset";

const { createLocationMock } = vi.hoisted(() => ({
  createLocationMock: vi.fn(async (params: any) => ({
    id: `tml_mock_${Math.random().toString(36).slice(2, 14)}`,
    ...params,
  })),
}));

vi.mock("stripe", async (importOriginal) => {
  const StripeModule = (await importOriginal()) as any;
  const OrigStripe = StripeModule.default ?? StripeModule;
  class MockStripe extends OrigStripe {
    constructor(...args: any[]) {
      super(...args);
      (this.terminal as any) = { locations: { create: createLocationMock } };
    }
  }
  return { ...StripeModule, default: MockStripe };
});

import { resolveTerminalLocationId } from "@/lib/stripe-terminal-location";

let organizerId: string;
const venueIds: string[] = [];

beforeAll(async () => {
  organizerId = await insertProfile({
    role: "organizer",
    displayName: "Location解決テスト用",
    email: `venue-location-test-${randomUUID().slice(0, 8)}@example.com`,
  });
});

afterAll(async () => {
  if (venueIds.length) await testAdmin.from("venues").delete().in("venue_id", venueIds);
  await testAdmin.from("profiles").delete().eq("profile_id", organizerId);
  await deleteAuthUsers([organizerId]);
});

async function insertVenue(overrides: Partial<{ stripe_terminal_location_id: string | null }> = {}) {
  const { data, error } = await testAdmin
    .from("venues")
    .insert({
      created_by: organizerId,
      name: `Location解決テスト会場${randomUUID().slice(0, 8)}`,
      postal_code: "400-0000",
      prefecture: "山梨県",
      city: "北杜市",
      town: null,
      line1: "野営地（白いゲート前）",
      stripe_terminal_location_id: overrides.stripe_terminal_location_id ?? null,
    })
    .select("venue_id")
    .single();
  if (error) throw new Error(error.message);
  venueIds.push(data.venue_id);
  return data.venue_id;
}

describe("TC-VENUE-LOCATION", () => {
  it("A. 未設定の会場はStripe Locationを作成しvenuesにキャッシュする", async () => {
    createLocationMock.mockClear();
    const venueId = await insertVenue();

    const locationId = await resolveTerminalLocationId(venueId);

    expect(locationId).toMatch(/^tml_mock_/);
    expect(createLocationMock).toHaveBeenCalledTimes(1);
    const callArg = createLocationMock.mock.calls[0][0];
    expect(callArg.address_kanji).toEqual({
      country: "JP",
      postal_code: "400-0000",
      state: "山梨県",
      city: "北杜市",
      town: "",
      line1: "野営地（白いゲート前）",
    });

    const { data: venue } = await testAdmin.from("venues").select("stripe_terminal_location_id").eq("venue_id", venueId).single();
    expect(venue?.stripe_terminal_location_id).toBe(locationId);
  });

  it("B. 既にstripe_terminal_location_idがある会場はStripe APIを呼ばずそのまま返す", async () => {
    createLocationMock.mockClear();
    const existingId = `tml_existing_${randomUUID().slice(0, 8)}`;
    const venueId = await insertVenue({ stripe_terminal_location_id: existingId });

    const locationId = await resolveTerminalLocationId(venueId);

    expect(locationId).toBe(existingId);
    expect(createLocationMock).not.toHaveBeenCalled();
  });

  it("C. 存在しないvenue_idはnullを返す", async () => {
    const locationId = await resolveTerminalLocationId(randomUUID());
    expect(locationId).toBeNull();
  });
});
