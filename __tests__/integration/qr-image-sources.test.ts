/**
 * TC-IMGSRC: QR画像の素材（宛先の画像の原本／イベントのフライヤー）— 2026-10-13
 *   A. アバターのアップロード：原本（長辺1600px以内）も保存される・原本なしなら従来どおり
 *   B. プロフィール更新：原本は本人の画像だけ受け付け、アバターと組で更新される
 *   C. フライヤーのアップロード：organizer以上のみ・元の比率のまま長辺1600px以内
 *   D. イベントの作成・編集：base_flyer_url を保存（自分たちのバケット以外は拒否・再承認にはしない）
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import sharp from "sharp";
import { insertProfile, deleteAuthUsers, insertEvent } from "../helpers/seed";
import { testAdmin } from "../helpers/db-reset";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(), getUser: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: () => null, getAll: () => [] })),
  headers: vi.fn(() => new Headers()),
}));
vi.mock("@/lib/apple-wallet-push", () => ({ pushWalletUpdateBySerial: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/email/notification", () => ({ sendLineupInviteEmail: vi.fn().mockResolvedValue(undefined) }));

import { createClient } from "@/lib/supabase/server";
import { POST as avatarUpload } from "@/app/api/avatar/upload/route";
import { POST as flyerUpload } from "@/app/api/events/flyer/upload/route";
import { PATCH as profilePatch } from "@/app/api/profile/route";
import { POST as eventCreate } from "@/app/api/events/create/route";
import { PATCH as eventPatch } from "@/app/api/events/[eventId]/route";
import { storagePublicPrefix } from "@/lib/image-source";

const ts = Date.now();
const profileIds: string[] = [];
const eventIds: string[] = [];
const stored: { bucket: string; path: string }[] = [];
let artistId: string;
let otherId: string;
let organizerId: string;
let agentId: string;

// ルートが使う「ログイン中ユーザーの supabase」を、その人として振る舞うクライアントに差し替える
function mockAs(id: string | null) {
  (createClient as any).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: id ? { id } : null }, error: null }) },
    from: (table: string) => testAdmin.from(table),
  });
}

async function jpeg(width: number, height: number): Promise<Blob> {
  const buf = await sharp({ create: { width, height, channels: 3, background: { r: 236, g: 72, b: 153 } } }).jpeg().toBuffer();
  return new Blob([new Uint8Array(buf)], { type: "image/jpeg" });
}

function multipart(url: string, files: Record<string, Blob>): Request {
  const fd = new FormData();
  for (const [k, v] of Object.entries(files)) fd.append(k, v, `${k}.jpg`);
  return new Request(url, { method: "POST", body: fd });
}

function json(url: string, method: string, body: unknown): Request {
  return new Request(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

// 公開URL → 保存された画像のサイズと形式（片付け用に記録もする）
async function storedMeta(bucket: string, url: string) {
  const path = url.slice(storagePublicPrefix(bucket).length);
  stored.push({ bucket, path });
  const { data, error } = await testAdmin.storage.from(bucket).download(path);
  if (error || !data) throw new Error(`download失敗 ${bucket}/${path}: ${error?.message}`);
  const meta = await sharp(Buffer.from(await data.arrayBuffer())).metadata();
  return { path, width: meta.width, height: meta.height, format: meta.format };
}

async function profileRow(id: string) {
  const { data } = await testAdmin.from("profiles")
    .select("avatar_url, avatar_original_url, artist_avatar_url, artist_avatar_original_url, organizer_avatar_url, organizer_avatar_original_url")
    .eq("profile_id", id).single();
  return data!;
}

beforeAll(async () => {
  artistId = await insertProfile({ role: "artist", displayName: "IMGSRC Artist", email: `imgsrc-artist-${ts}@test.local` });
  otherId = await insertProfile({ role: "artist", displayName: "IMGSRC Other", email: `imgsrc-other-${ts}@test.local` });
  organizerId = await insertProfile({ role: "organizer", displayName: "IMGSRC Organizer", email: `imgsrc-org-${ts}@test.local` });
  agentId = await insertProfile({ role: "agent", displayName: "IMGSRC Agent", email: `imgsrc-agent-${ts}@test.local` });
  profileIds.push(artistId, otherId, organizerId, agentId);
  await testAdmin.from("profiles").update({ responsible_agent_id: agentId }).eq("profile_id", organizerId);
}, 30_000);

afterAll(async () => {
  for (const bucket of ["avatars", "event-images"]) {
    const paths = stored.filter((s) => s.bucket === bucket).map((s) => s.path);
    if (paths.length) await testAdmin.storage.from(bucket).remove(paths);
  }
  if (eventIds.length) {
    await testAdmin.from("event_artists").delete().in("event_id", eventIds);
    await testAdmin.from("events").delete().in("event_id", eventIds);
  }
  await deleteAuthUsers(profileIds);
});

// ── A ──────────────────────────────────────────────────────────────────
describe("TC-IMGSRC-A: アバターのアップロードで原本も保存される", () => {
  it("A-01: 横長 2400×1600 の原本 → 1600×1067 の webp・アバターは 400×400", async () => {
    mockAs(artistId);
    const res = await avatarUpload(multipart("http://x/api/avatar/upload", { file: await jpeg(800, 800), original: await jpeg(2400, 1600) }));
    expect(res.status).toBe(200);
    const body = await res.json();
    const avatar = await storedMeta("avatars", body.url);
    const original = await storedMeta("avatars", body.originalUrl);
    expect(avatar).toEqual({ path: avatar.path, width: 400, height: 400, format: "webp" });
    expect(original).toEqual({ path: avatar.path.replace(/\.webp$/, "-original.webp"), width: 1600, height: 1067, format: "webp" });
    expect(avatar.path.startsWith(`${artistId}/`)).toBe(true);
  });

  it("A-02: 縦長 1000×3000 の原本 → 長辺 1600（533×1600）", async () => {
    mockAs(artistId);
    const body = await (await avatarUpload(multipart("http://x/api/avatar/upload", { file: await jpeg(400, 400), original: await jpeg(1000, 3000) }))).json();
    const original = await storedMeta("avatars", body.originalUrl);
    expect([original.width, original.height]).toEqual([533, 1600]);
  });

  it("A-03: 小さい原本 900×600 → 拡大しない（900×600 のまま）", async () => {
    mockAs(artistId);
    const body = await (await avatarUpload(multipart("http://x/api/avatar/upload", { file: await jpeg(400, 400), original: await jpeg(900, 600) }))).json();
    const original = await storedMeta("avatars", body.originalUrl);
    expect([original.width, original.height]).toEqual([900, 600]);
  });

  it("A-04: 原本なし（従来の送り方）→ originalUrl は null・アバターは保存される", async () => {
    mockAs(artistId);
    const res = await avatarUpload(multipart("http://x/api/avatar/upload", { file: await jpeg(500, 500) }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.originalUrl).toBe(null);
    const avatar = await storedMeta("avatars", body.url);
    expect([avatar.width, avatar.height]).toEqual([400, 400]);
  });

  it("A-05: 未ログイン → 401", async () => {
    mockAs(null);
    const res = await avatarUpload(multipart("http://x/api/avatar/upload", { file: await jpeg(400, 400) }));
    expect(res.status).toBe(401);
  });
});

// ── B ──────────────────────────────────────────────────────────────────
describe("TC-IMGSRC-B: プロフィール更新で原本をアバターと組で保存", () => {
  const own = (name: string) => `${storagePublicPrefix("avatars")}${artistId}/${name}`;

  it("B-01: アバターと原本を一緒に送る → 両方保存", async () => {
    mockAs(artistId);
    const res = await profilePatch(json("http://x/api/profile", "PATCH", {
      artist_avatar_url: own(`a-${ts}.webp`), artist_avatar_original_url: own(`a-${ts}-original.webp`),
      avatar_url: own(`b-${ts}.webp`), avatar_original_url: own(`b-${ts}-original.webp`),
    }));
    expect(res.status).toBe(200);
    const row = await profileRow(artistId);
    expect(row.artist_avatar_url).toBe(own(`a-${ts}.webp`));
    expect(row.artist_avatar_original_url).toBe(own(`a-${ts}-original.webp`));
    expect(row.avatar_url).toBe(own(`b-${ts}.webp`));
    expect(row.avatar_original_url).toBe(own(`b-${ts}-original.webp`));
  });

  it("B-02: アバターを変えずに保存（原本を送らない）→ 原本はそのまま", async () => {
    mockAs(artistId);
    const res = await profilePatch(json("http://x/api/profile", "PATCH", { display_name: "IMGSRC Artist", artist_avatar_url: own(`a-${ts}.webp`) }));
    expect(res.status).toBe(200);
    expect((await profileRow(artistId)).artist_avatar_original_url).toBe(own(`a-${ts}-original.webp`));
  });

  it("B-03: アバターだけ差し替え（原本を送らない）→ 原本は null に戻る（前の写真の原本を残さない）", async () => {
    mockAs(artistId);
    const res = await profilePatch(json("http://x/api/profile", "PATCH", { artist_avatar_url: own(`a2-${ts}.webp`) }));
    expect(res.status).toBe(200);
    const row = await profileRow(artistId);
    expect(row.artist_avatar_url).toBe(own(`a2-${ts}.webp`));
    expect(row.artist_avatar_original_url).toBe(null);
    // 別の組（基本の画像）は巻き込まない
    expect(row.avatar_original_url).toBe(own(`b-${ts}-original.webp`));
  });

  it.each([
    ["他人のフォルダの画像", () => `${storagePublicPrefix("avatars")}${otherId}/x-original.webp`],
    ["外部URL", () => "https://evil.example.com/x.webp"],
    ["別バケット（event-images）", () => `${storagePublicPrefix("event-images")}${artistId}/x.webp`],
  ])("B-04: 原本に %s → 400・何も変わらない", async (_label, url) => {
    mockAs(artistId);
    const before = await profileRow(artistId);
    const res = await profilePatch(json("http://x/api/profile", "PATCH", { avatar_url: own(`c-${ts}.webp`), avatar_original_url: url() }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("avatar_original_url の形式が不正です");
    expect(await profileRow(artistId)).toEqual(before);
  });

  it("B-05: アバターを消す（null・原本も null）→ 両方 null", async () => {
    mockAs(artistId);
    const res = await profilePatch(json("http://x/api/profile", "PATCH", { avatar_url: null, avatar_original_url: null }));
    expect(res.status).toBe(200);
    const row = await profileRow(artistId);
    expect(row.avatar_url).toBe(null);
    expect(row.avatar_original_url).toBe(null);
  });
});

// ── C ──────────────────────────────────────────────────────────────────
describe("TC-IMGSRC-C: フライヤーのアップロード", () => {
  it("C-01: 主催者が縦長 1200×3000 を上げる → 元の比率のまま 640×1600 の webp", async () => {
    mockAs(organizerId);
    const res = await flyerUpload(multipart("http://x/api/events/flyer/upload", { file: await jpeg(1200, 3000) }));
    expect(res.status).toBe(200);
    const meta = await storedMeta("event-images", (await res.json()).url);
    expect(meta).toEqual({ path: meta.path, width: 640, height: 1600, format: "webp" });
    expect(meta.path.startsWith(`${organizerId}/`)).toBe(true);
  });

  it("C-02: エージェントも上げられる（ロールは上位互換）・小さい画像は拡大しない", async () => {
    mockAs(agentId);
    const res = await flyerUpload(multipart("http://x/api/events/flyer/upload", { file: await jpeg(800, 1000) }));
    expect(res.status).toBe(200);
    const meta = await storedMeta("event-images", (await res.json()).url);
    expect([meta.width, meta.height]).toEqual([800, 1000]);
  });

  it("C-03: アーティスト → 403", async () => {
    mockAs(artistId);
    const res = await flyerUpload(multipart("http://x/api/events/flyer/upload", { file: await jpeg(800, 1000) }));
    expect(res.status).toBe(403);
  });

  it("C-04: 未ログイン → 401", async () => {
    mockAs(null);
    const res = await flyerUpload(multipart("http://x/api/events/flyer/upload", { file: await jpeg(800, 1000) }));
    expect(res.status).toBe(401);
  });

  it("C-05: 画像でないファイル → 400", async () => {
    mockAs(organizerId);
    const res = await flyerUpload(multipart("http://x/api/events/flyer/upload", { file: new Blob(["not an image"], { type: "image/jpeg" }) }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("画像を読み込めませんでした");
  });
});

// ── D ──────────────────────────────────────────────────────────────────
describe("TC-IMGSRC-D: イベントの作成・編集でフライヤーを保存", () => {
  const flyer = (name: string) => `${storagePublicPrefix("event-images")}${organizerId}/${name}`;
  const createBody = (extra: Record<string, unknown>) => ({
    title: `IMGSRC Event ${ts}`, venue: "テスト会場",
    start_at: new Date(Date.now() + 7 * 86400e3).toISOString(), end_at: new Date(Date.now() + 7 * 86400e3 + 3 * 3600e3).toISOString(),
    artists: [], ...extra,
  });
  const flyerOf = async (eventId: string) =>
    (await testAdmin.from("events").select("base_flyer_url, lifecycle_status").eq("event_id", eventId).single()).data!;

  it("D-01: 作成時にフライヤーを付ける → 保存される", async () => {
    mockAs(organizerId);
    const res = await eventCreate(json("http://x/api/events/create", "POST", createBody({ base_flyer_url: flyer(`f1-${ts}.webp`) })));
    expect(res.status).toBe(200);
    const { event_id } = await res.json();
    eventIds.push(event_id);
    expect((await flyerOf(event_id)).base_flyer_url).toBe(flyer(`f1-${ts}.webp`));
  });

  it("D-02: 作成時にフライヤーなし（従来の送り方）→ null", async () => {
    mockAs(organizerId);
    const res = await eventCreate(json("http://x/api/events/create", "POST", createBody({})));
    expect(res.status).toBe(200);
    const { event_id } = await res.json();
    eventIds.push(event_id);
    expect((await flyerOf(event_id)).base_flyer_url).toBe(null);
  });

  it("D-03: 作成時に外部URL → 400・イベントは作られない", async () => {
    mockAs(organizerId);
    const title = `IMGSRC Rejected ${ts}`;
    const res = await eventCreate(json("http://x/api/events/create", "POST", { ...createBody({ base_flyer_url: "https://evil.example.com/f.webp" }), title }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("フライヤー画像の形式が不正です");
    const { count } = await testAdmin.from("events").select("event_id", { count: "exact", head: true }).eq("title", title);
    expect(count).toBe(0);
  });

  it("D-04: 公開中のイベントでフライヤーを変更 → 保存・再承認（draft）にはならない", async () => {
    const eventId = await insertEvent({ organizerProfileId: organizerId, agentId });
    eventIds.push(eventId);
    mockAs(organizerId);
    const res = await eventPatch(json("http://x", "PATCH", { base_flyer_url: flyer(`f2-${ts}.webp`) }), { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(200);
    expect((await res.json()).re_approval_required).toBe(false);
    expect(await flyerOf(eventId)).toEqual({ base_flyer_url: flyer(`f2-${ts}.webp`), lifecycle_status: "published" });
  });

  it("D-05: 編集でフライヤーを外す（null）→ null", async () => {
    const eventId = await insertEvent({ organizerProfileId: organizerId, agentId });
    eventIds.push(eventId);
    await testAdmin.from("events").update({ base_flyer_url: flyer(`f3-${ts}.webp`) }).eq("event_id", eventId);
    mockAs(organizerId);
    const res = await eventPatch(json("http://x", "PATCH", { base_flyer_url: null }), { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(200);
    expect((await flyerOf(eventId)).base_flyer_url).toBe(null);
  });

  it("D-06: 編集で外部URL → 400・元のフライヤーのまま", async () => {
    const eventId = await insertEvent({ organizerProfileId: organizerId, agentId });
    eventIds.push(eventId);
    await testAdmin.from("events").update({ base_flyer_url: flyer(`f4-${ts}.webp`) }).eq("event_id", eventId);
    mockAs(organizerId);
    const res = await eventPatch(json("http://x", "PATCH", { title: "変えようとした", base_flyer_url: "https://evil.example.com/f.webp" }), { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(400);
    const { data } = await testAdmin.from("events").select("base_flyer_url, title").eq("event_id", eventId).single();
    expect(data!.base_flyer_url).toBe(flyer(`f4-${ts}.webp`));
    expect(data!.title).toBe("テストイベント");
  });

  it("D-07: 編集でフライヤー項目を送らない（従来の送り方）→ 元のフライヤーのまま", async () => {
    const eventId = await insertEvent({ organizerProfileId: organizerId, agentId });
    eventIds.push(eventId);
    await testAdmin.from("events").update({ base_flyer_url: flyer(`f5-${ts}.webp`) }).eq("event_id", eventId);
    mockAs(organizerId);
    const res = await eventPatch(json("http://x", "PATCH", { title: "タイトルだけ変更" }), { params: Promise.resolve({ eventId }) });
    expect(res.status).toBe(200);
    expect((await flyerOf(eventId)).base_flyer_url).toBe(flyer(`f5-${ts}.webp`));
  });
});
