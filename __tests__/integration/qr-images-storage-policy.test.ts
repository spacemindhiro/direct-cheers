/**
 * TC-QRIMG: qr-images バケットの書き換え権限 — 2026-10-12
 *
 * 以前は UPDATE/DELETE ポリシーが bucket_id しか見ておらず、ログインさえしていれば
 * ブラウザから Storage API を直接叩いて他人のQR画像（/c ページ・チアカード・Walletの画像）を
 * 上書き・削除できた。画像の公開URLは /c ページの <img src> にそのまま出ているので、パスも分かる。
 *   A. 他人の画像は上書き・削除できない（update / upsert / remove / 未ログイン）
 *   B. 本人の操作と通常のアップロード（アプリが実際に呼ぶ形）は今までどおり通る
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { testAdmin } from "../helpers/db-reset";
import { insertProfile, deleteAuthUsers } from "../helpers/seed";

const BUCKET = "qr-images";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const ts = Date.now();

const profileIds: string[] = [];
const uploadedPaths: string[] = [];
let owner: SupabaseClient;
let other: SupabaseClient;
let anon: SupabaseClient;

function newClient(): SupabaseClient {
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function signedIn(email: string): Promise<SupabaseClient> {
  const c = newClient();
  const { error } = await c.auth.signInWithPassword({ email, password: "TestPass123!" });
  if (error) throw new Error(`ログイン失敗 [${email}]: ${error.message}`);
  return c;
}

function jpeg(text: string): Blob {
  return new Blob([text], { type: "image/jpeg" });
}

// 実際に保存されている中身（RLSを通さない管理者権限で読む）
async function storedText(path: string): Promise<string | null> {
  const { data, error } = await testAdmin.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  return await data.text();
}

// 所有者がアプリと同じ形（`${prefix}/${Date.now()}.jpg`・upsert:true）でアップロードした画像を用意する
async function ownerImage(label: string): Promise<{ path: string; content: string }> {
  const path = `${crypto.randomUUID()}/${Date.now()}.jpg`;
  const content = `OWNER-${label}-${ts}`;
  const { error } = await owner.storage.from(BUCKET).upload(path, jpeg(content), { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(`所有者のアップロード失敗: ${error.message}`);
  uploadedPaths.push(path);
  return { path, content };
}

beforeAll(async () => {
  const ownerEmail = `qrimg-owner-${ts}@test.local`;
  const otherEmail = `qrimg-other-${ts}@test.local`;
  profileIds.push(await insertProfile({ role: "organizer", displayName: "QRIMG Owner", email: ownerEmail }));
  profileIds.push(await insertProfile({ role: "user", displayName: "QRIMG Other", email: otherEmail }));
  owner = await signedIn(ownerEmail);
  other = await signedIn(otherEmail);
  anon = newClient();
});

afterAll(async () => {
  if (uploadedPaths.length) await testAdmin.storage.from(BUCKET).remove(uploadedPaths);
  await deleteAuthUsers(profileIds);
});

// ── A ──────────────────────────────────────────────────────────────────
describe("TC-QRIMG-A: 他人の画像は上書き・削除できない", () => {
  it("A-01: 他人が update で上書き → エラー・中身は元のまま", async () => {
    const { path, content } = await ownerImage("A01");
    const { error } = await other.storage.from(BUCKET).update(path, jpeg("ATTACK"), { contentType: "image/jpeg" });
    expect(error).not.toBeNull();
    expect(await storedText(path)).toBe(content);
  });

  it("A-02: 他人が upload(upsert:true) で上書き → エラー・中身は元のまま", async () => {
    const { path, content } = await ownerImage("A02");
    const { error } = await other.storage.from(BUCKET).upload(path, jpeg("ATTACK"), { contentType: "image/jpeg", upsert: true });
    expect(error).not.toBeNull();
    expect(await storedText(path)).toBe(content);
  });

  it("A-03: 他人が upload(upsert:false) で同じパスに保存 → エラー・中身は元のまま", async () => {
    const { path, content } = await ownerImage("A03");
    const { error } = await other.storage.from(BUCKET).upload(path, jpeg("ATTACK"), { contentType: "image/jpeg", upsert: false });
    expect(error).not.toBeNull();
    expect(await storedText(path)).toBe(content);
  });

  it("A-04: 他人が remove → 1件も消えない・中身は元のまま", async () => {
    const { path, content } = await ownerImage("A04");
    const { data } = await other.storage.from(BUCKET).remove([path]);
    expect(data?.length ?? 0).toBe(0);
    expect(await storedText(path)).toBe(content);
  });

  it("A-05: 未ログインで update / remove → どちらも効かない・中身は元のまま", async () => {
    const { path, content } = await ownerImage("A05");
    const upd = await anon.storage.from(BUCKET).update(path, jpeg("ATTACK"), { contentType: "image/jpeg" });
    expect(upd.error).not.toBeNull();
    const del = await anon.storage.from(BUCKET).remove([path]);
    expect(del.data?.length ?? 0).toBe(0);
    expect(await storedText(path)).toBe(content);
  });
});

// ── B ──────────────────────────────────────────────────────────────────
describe("TC-QRIMG-B: 本人の操作・通常のアップロードは通る", () => {
  it("B-01: アプリと同じ形のアップロード（新しいパス・upsert:true）→ 成功・中身が一致", async () => {
    const { path, content } = await ownerImage("B01");
    expect(await storedText(path)).toBe(content);
  });

  it("B-02: 他人も自分の新しいパスには普通にアップロードできる", async () => {
    const path = `${crypto.randomUUID()}/${Date.now()}.jpg`;
    const content = `OTHER-B02-${ts}`;
    const { error } = await other.storage.from(BUCKET).upload(path, jpeg(content), { contentType: "image/jpeg", upsert: true });
    uploadedPaths.push(path);
    expect(error).toBeNull();
    expect(await storedText(path)).toBe(content);
  });

  it("B-03: 本人は自分の画像を update で上書きできる", async () => {
    const { path } = await ownerImage("B03");
    const next = `OWNER-B03-UPDATED-${ts}`;
    const { error } = await owner.storage.from(BUCKET).update(path, jpeg(next), { contentType: "image/jpeg" });
    expect(error).toBeNull();
    expect(await storedText(path)).toBe(next);
  });

  it("B-04: 本人は自分の画像を remove できる", async () => {
    const { path } = await ownerImage("B04");
    const { data, error } = await owner.storage.from(BUCKET).remove([path]);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
    expect(await storedText(path)).toBe(null);
  });
});
