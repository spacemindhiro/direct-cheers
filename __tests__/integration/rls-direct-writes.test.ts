/**
 * TC-RLSW: ブラウザから Supabase を直接叩く経路の書き込み権限 — 2026-10-14
 *
 * APIを直しても、anon key + 本人のJWT で PostgREST を直接叩けば同じ書き換えができた
 * （他のテストはサーバーのDB接続を管理者権限に差し替えて動くため、RLSが効いておらず検出できなかった）。
 * ここでは本物のログインユーザーとしてRLSを通して確かめる。書き込み後の実際の値は管理者権限で読み直す。
 *   A. profiles: 管理用の列（role・出金凍結・手数料率・審査状態）は本人が変えられない／画面が使う更新は通る
 *   B. events / event_artists: 直接の作成・公開・出演行の付け替えはできない
 *   C. entrance_reservations: 本人は読めるが、請求額の書き換え・予約の直接作成はできない
 *   D. qr_config_targets: 配分比率は直接書けない・DBでも 0〜1 以外は保存できない
 *   E. RPC: 招待の受諾は本人（宛先メール一致）にだけ・カウンタ系は未ログインから呼べない
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { testAdmin } from "../helpers/db-reset";
import {
  insertProfile, deleteAuthUsers, insertEvent, insertEventArtist, insertProduct, insertQrConfig, insertQrConfigTargets,
} from "../helpers/seed";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const ts = Date.now();

const profileIds: string[] = [];
const eventIds: string[] = [];
const invitationIds: string[] = [];

let userId: string;
let organizerId: string;
let artistId: string;
let otherOrganizerId: string;
let user: SupabaseClient;
let organizer: SupabaseClient;
let artist: SupabaseClient;
let anon: SupabaseClient;
const userEmail = `rlsw-user-${ts}@test.local`;
const artistEmail = `rlsw-artist-${ts}@test.local`;

let eventId: string;
let otherEventId: string;
let qrConfigId: string;
let productId: string;
let eventArtistId: string;
let reservationId: string;

function newClient(): SupabaseClient {
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function signedIn(email: string): Promise<SupabaseClient> {
  const c = newClient();
  const { error } = await c.auth.signInWithPassword({ email, password: "TestPass123!" });
  if (error) throw new Error(`ログイン失敗 [${email}]: ${error.message}`);
  return c;
}

async function profileRow(id: string) {
  const { data } = await testAdmin
    .from("profiles")
    .select("role, status, balance_frozen, base_fee_rate, verification_status, pending_role, display_name, stripe_connect_id")
    .eq("profile_id", id)
    .single();
  return data!;
}

beforeAll(async () => {
  userId = await insertProfile({ role: "user", displayName: "RLSW User", email: userEmail });
  organizerId = await insertProfile({ role: "organizer", displayName: "RLSW Org", email: `rlsw-org-${ts}@test.local` });
  artistId = await insertProfile({ role: "artist", displayName: "RLSW Artist", email: artistEmail });
  otherOrganizerId = await insertProfile({ role: "organizer", displayName: "RLSW Org2", email: `rlsw-org2-${ts}@test.local` });
  profileIds.push(userId, organizerId, artistId, otherOrganizerId);
  // 出金凍結中・審査未了の状態を用意（凍結の自己解除を確かめるため）
  await testAdmin.from("profiles").update({ balance_frozen: true, verification_status: "unverified" }).eq("profile_id", userId);

  eventId = await insertEvent({ organizerProfileId: organizerId, title: `RLSW ${ts}` });
  otherEventId = await insertEvent({ organizerProfileId: otherOrganizerId, title: `RLSW other ${ts}` });
  eventIds.push(eventId, otherEventId);
  await testAdmin.from("events").update({ lifecycle_status: "review_requested" }).eq("event_id", eventId);

  productId = await insertProduct({ eventId, paymentType: "A" });
  qrConfigId = await insertQrConfig({ eventId, creatorProfileId: organizerId, recipientProfileId: artistId, productId });
  await insertQrConfigTargets(qrConfigId, [{ profileId: artistId, ratio: 1 }]);
  await insertEventArtist({ eventId, artistProfileId: artistId, status: "pending" });
  const { data: ea } = await testAdmin.from("event_artists").select("event_artist_id")
    .eq("event_id", eventId).eq("artist_profile_id", artistId).single();
  eventArtistId = ea!.event_artist_id;

  const { data: rsv, error } = await testAdmin.from("entrance_reservations").insert({
    product_id: productId, event_id: eventId, email: userEmail, profile_id: userId,
    status: "reserved", charge_amount: 5000, stripe_setup_intent_id: `seti_rlsw_${ts}`, stripe_customer_id: `cus_rlsw_${ts}`,
  }).select("reservation_id").single();
  if (error) throw new Error(`予約の挿入失敗: ${error.message}`);
  reservationId = rsv!.reservation_id;

  user = await signedIn(userEmail);
  organizer = await signedIn(`rlsw-org-${ts}@test.local`);
  artist = await signedIn(artistEmail);
  anon = newClient();
}, 60_000);

afterAll(async () => {
  await testAdmin.from("entrance_reservations").delete().eq("product_id", productId);
  if (invitationIds.length) await testAdmin.from("invitations").delete().in("invitation_id", invitationIds);
  await testAdmin.from("connections").delete().in("organizer_profile_id", [organizerId, otherOrganizerId]);
  await testAdmin.from("qr_config_targets").delete().eq("qr_config_id", qrConfigId);
  await testAdmin.from("qr_configs").delete().eq("qr_config_id", qrConfigId);
  await testAdmin.from("event_artists").delete().in("event_id", eventIds);
  await testAdmin.from("products").delete().eq("product_id", productId);
  await testAdmin.from("events").delete().in("event_id", eventIds);
  await testAdmin.from("events").delete().eq("title", `RLSW injected ${ts}`);
  await deleteAuthUsers(profileIds);
}, 60_000);

// ── A. profiles ─────────────────────────────────────────────────────────────
describe("TC-RLSW-A: profiles の管理用の列は本人が変えられない", () => {
  it("TC-RLSW-A-01: role=admin・凍結解除・手数料0%・審査済みへの直接UPDATEは元の値のまま（表示名だけ変わる）", async () => {
    const displayName = `RLSW renamed ${ts}`;
    await user.from("profiles").update({
      role: "admin", balance_frozen: false, base_fee_rate: 0, verification_status: "verified",
      status: "active", stripe_connect_id: "acct_attacker", display_name: displayName,
    }).eq("profile_id", userId);

    const row = await profileRow(userId);
    expect(row.role).toBe("user");
    expect(row.balance_frozen).toBe(true);
    expect(Number(row.base_fee_rate)).toBe(0.1);
    expect(row.verification_status).toBe("unverified");
    expect(row.status).toBe("active");
    expect(row.stripe_connect_id).toBeNull();
    expect(row.display_name).toBe(displayName);
  });

  it("TC-RLSW-A-02: クリエイター申請（審査待ちへ・希望ロール）は今までどおり本人が更新できる", async () => {
    const { error } = await user.from("profiles")
      .update({ verification_status: "pending", pending_role: "organizer" })
      .eq("profile_id", userId);
    expect(error).toBeNull();
    const row = await profileRow(userId);
    expect(row.verification_status).toBe("pending");
    expect(row.pending_role).toBe("organizer");
  });

  it("TC-RLSW-A-03: 初回プロフィール登録（upsert）で role=admin を送っても user で作られる", async () => {
    const email = `rlsw-new-${ts}@test.local`;
    const { data: created } = await testAdmin.auth.admin.createUser({ email, password: "TestPass123!", email_confirm: true });
    const newId = created.user!.id;
    profileIds.push(newId);
    const client = await signedIn(email);

    const { error } = await client.from("profiles")
      .upsert({ profile_id: newId, display_name: "RLSW New", role: "admin", base_fee_rate: 0 }, { onConflict: "profile_id" });
    expect(error).toBeNull();
    const row = await profileRow(newId);
    expect(row.role).toBe("user");
    expect(Number(row.base_fee_rate)).toBe(0.1);
    expect(row.display_name).toBe("RLSW New");
  });

  it("TC-RLSW-A-04: 既存の主催者が初回登録画面の upsert（role:'user'）を通っても降格しない", async () => {
    const { error } = await organizer.from("profiles")
      .upsert({ profile_id: organizerId, display_name: "RLSW Org", role: "user" }, { onConflict: "profile_id" });
    expect(error).toBeNull();
    expect((await profileRow(organizerId)).role).toBe("organizer");
  });
});

// ── B. events / event_artists ───────────────────────────────────────────────
describe("TC-RLSW-B: イベント・出演行は直接書き換えられない", () => {
  it("TC-RLSW-B-01: 一般ユーザーは他人を主催者にした公開済みイベントを直接作れない", async () => {
    const { error } = await user.from("events").insert({
      title: `RLSW injected ${ts}`, organizer_profile_id: organizerId, agent_id: organizerId,
      lifecycle_status: "published", start_at: new Date().toISOString(), end_at: new Date().toISOString(), venue: "x",
    });
    expect(error).not.toBeNull();
    const { count } = await testAdmin.from("events").select("event_id", { count: "exact", head: true }).eq("title", `RLSW injected ${ts}`);
    expect(count).toBe(0);
  });

  it("TC-RLSW-B-02: 主催者でも承認待ちの自分のイベントを直接 published にできない", async () => {
    await organizer.from("events").update({ lifecycle_status: "published" }).eq("event_id", eventId);
    const { data } = await testAdmin.from("events").select("lifecycle_status").eq("event_id", eventId).single();
    expect(data!.lifecycle_status).toBe("review_requested");
  });

  it("TC-RLSW-B-03: アーティストは自分の出演行を別のイベントへ移して確定にできない", async () => {
    await artist.from("event_artists").update({ event_id: otherEventId, status: "confirmed" }).eq("event_artist_id", eventArtistId);
    const { data } = await testAdmin.from("event_artists").select("event_id, status").eq("event_artist_id", eventArtistId).single();
    expect(data!.event_id).toBe(eventId);
    expect(data!.status).toBe("pending");
  });
});

// ── C. entrance_reservations ────────────────────────────────────────────────
describe("TC-RLSW-C: 前売り予約は本人が読めるだけ", () => {
  it("TC-RLSW-C-01: 本人は自分の予約を読める（今までどおり）", async () => {
    const { data } = await user.from("entrance_reservations").select("reservation_id, charge_amount").eq("reservation_id", reservationId);
    expect(data).toEqual([{ reservation_id: reservationId, charge_amount: 5000 }]);
  });

  it("TC-RLSW-C-02: 請求額を 5000円→1円 に書き換えられない", async () => {
    await user.from("entrance_reservations").update({ charge_amount: 1, status: "reserved" }).eq("reservation_id", reservationId);
    const { data } = await testAdmin.from("entrance_reservations").select("charge_amount").eq("reservation_id", reservationId).single();
    expect(data!.charge_amount).toBe(5000);
  });

  it("TC-RLSW-C-03: 予約済み・1円の予約を直接作れない", async () => {
    const { error } = await user.from("entrance_reservations").insert({
      product_id: productId, event_id: eventId, email: userEmail, profile_id: userId,
      status: "reserved", charge_amount: 1, stripe_setup_intent_id: "seti_x", stripe_customer_id: "cus_x",
    });
    expect(error).not.toBeNull();
    const { count } = await testAdmin.from("entrance_reservations").select("reservation_id", { count: "exact", head: true }).eq("product_id", productId);
    expect(count).toBe(1);
  });
});

// ── D. qr_config_targets ────────────────────────────────────────────────────
describe("TC-RLSW-D: 配分比率", () => {
  it("TC-RLSW-D-01: 主催者でも配分比率を直接書き換えられない（-0.5）", async () => {
    await organizer.from("qr_config_targets").update({ distribution_ratio: -0.5 }).eq("qr_config_id", qrConfigId);
    const { data } = await testAdmin.from("qr_config_targets").select("distribution_ratio").eq("qr_config_id", qrConfigId).single();
    expect(Number(data!.distribution_ratio)).toBe(1);
  });

  it.each([[1.09], [-0.09]])("TC-RLSW-D-02: サーバー権限でも比率 %s は保存できない（DBの制約）", async (ratio) => {
    const { error } = await testAdmin.from("qr_config_targets").update({ distribution_ratio: ratio }).eq("qr_config_id", qrConfigId);
    expect(error?.message).toContain("qr_config_targets_ratio_range");
  });

  it("TC-RLSW-D-03: 0%（画面で空欄のまま送られる値）は保存できる", async () => {
    const { error } = await testAdmin.from("qr_config_targets").update({ distribution_ratio: 0 }).eq("qr_config_id", qrConfigId);
    expect(error).toBeNull();
    await testAdmin.from("qr_config_targets").update({ distribution_ratio: 1 }).eq("qr_config_id", qrConfigId);
  });
});

// ── E. RPC ──────────────────────────────────────────────────────────────────
describe("TC-RLSW-E: 関数を直接呼ぶ経路", () => {
  async function newInvitation(targetEmail: string): Promise<string> {
    const token = crypto.randomUUID();
    const { data, error } = await testAdmin.from("invitations").insert({
      token, invited_by_profile_id: organizerId, target_role: "artist", target_email: targetEmail,
      status: "pending", expires_at: new Date(Date.now() + 86400_000).toISOString(),
    }).select("invitation_id").single();
    if (error) throw new Error(`招待の挿入失敗: ${error.message}`);
    invitationIds.push(data!.invitation_id);
    return token;
  }

  it("TC-RLSW-E-01: 招待トークンを他人のユーザーIDに適用できない（role は user のまま）", async () => {
    const token = await newInvitation(artistEmail);
    const { data } = await artist.rpc("accept_invitation", { p_token: token, p_user_id: userId });
    expect(data).toEqual({ error: "wrong_recipient" });
    expect((await profileRow(userId)).role).toBe("user");
  });

  it("TC-RLSW-E-02: 宛先メールが違う本人は受諾できない", async () => {
    const token = await newInvitation(`someone-else-${ts}@test.local`);
    const { data } = await user.rpc("accept_invitation", { p_token: token, p_user_id: userId });
    expect(data).toEqual({ error: "wrong_recipient" });
    expect((await profileRow(userId)).role).toBe("user");
  });

  it("TC-RLSW-E-03: 宛先メールの本人は今までどおり受諾できる", async () => {
    const token = await newInvitation(userEmail);
    const { data } = await user.rpc("accept_invitation", { p_token: token, p_user_id: userId });
    expect(data).toEqual({ success: true, role: "artist" });
    expect((await profileRow(userId)).role).toBe("artist");
  });

  it("TC-RLSW-E-04: 未ログインからは招待の受諾・カウンタ系の関数を呼べない", async () => {
    const token = await newInvitation(userEmail);
    const inv = await anon.rpc("accept_invitation", { p_token: token, p_user_id: userId });
    expect(inv.error?.code).toBe("42501");
    for (const fn of ["increment_chargeback_count", "increment_follower_count", "decrement_follower_count"]) {
      const arg = fn === "increment_chargeback_count" ? { target_profile_id: organizerId } : { p_profile_id: organizerId };
      const res = await anon.rpc(fn, arg);
      expect(res.error?.code, fn).toBe("42501");
    }
  });
});
