/**
 * テスト用ユーザーをロールごとに作成するシードスクリプト
 *
 * 使い方:
 *   npx tsx scripts/seed-test-users.ts
 *
 * 既存ユーザーは上書きせず、存在しない場合のみ作成する。
 * 再実行しても安全（冪等）。
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌ .env.local の NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

type Role = "admin" | "agent" | "organizer" | "artist" | "user";

const TEST_USERS: {
  email: string;
  password: string;
  role: Role;
  display_name: string;
}[] = [
  { email: "spacemind.hiro+admin@gmail.com",     password: "TestAdmin1234!",     role: "admin",     display_name: "テスト管理者" },
  { email: "spacemind.hiro+agent@gmail.com",     password: "TestAgent1234!",     role: "agent",     display_name: "テストエージェント" },
  { email: "spacemind.hiro+organizer@gmail.com", password: "TestOrganizer1234!", role: "organizer", display_name: "テスト主催者" },
  { email: "spacemind.hiro+artist@gmail.com",    password: "TestArtist1234!",    role: "artist",    display_name: "テストアーティスト" },
  { email: "spacemind.hiro+fan@gmail.com",       password: "TestFan1234!",       role: "user",      display_name: "テストファン" },
];

async function seedUser(user: (typeof TEST_USERS)[number]) {
  const { email, password, role, display_name } = user;

  // 既存ユーザーを検索
  const { data: existing } = await admin.auth.admin.listUsers();
  const found = existing?.users.find((u) => u.email === email);

  let userId: string;

  if (found) {
    console.log(`  ↩  ${email} は既存 (${found.id.slice(0, 8)}...) — スキップ`);
    userId = found.id;
  } else {
    // auth user 作成
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !created.user) {
      console.error(`  ❌ ${email} の作成失敗:`, error?.message);
      return;
    }
    userId = created.user.id;
    console.log(`  ✅ ${email} 作成 (${userId.slice(0, 8)}...)`);
  }

  // profiles upsert（role / status / display_name）
  const { error: profileErr } = await admin.from("profiles").upsert(
    {
      profile_id: userId,
      role,
      status: "active",
      display_name,
    },
    { onConflict: "profile_id" }
  );

  if (profileErr) {
    console.error(`  ❌ profiles upsert 失敗 (${email}):`, profileErr.message);
  } else {
    console.log(`     profile: role=${role}, status=active`);
  }
}

async function main() {
  console.log("🌱 テストユーザーのシードを開始...\n");
  for (const user of TEST_USERS) {
    await seedUser(user);
  }

  // テストエージェントをテストオーガナイザーの responsible_agent_id にセット
  const { data: allUsers } = await admin.auth.admin.listUsers();
  const agentUser = allUsers?.users.find((u) => u.email === "spacemind.hiro+agent@gmail.com");
  const organizerUser = allUsers?.users.find((u) => u.email === "spacemind.hiro+organizer@gmail.com");

  if (agentUser && organizerUser) {
    const { error } = await admin
      .from("profiles")
      .update({ responsible_agent_id: agentUser.id })
      .eq("profile_id", organizerUser.id);
    if (error) {
      console.error("  ❌ responsible_agent_id のセット失敗:", error.message);
    } else {
      console.log(`\n  🔗 organizer の responsible_agent_id → agent (${agentUser.id.slice(0, 8)}...)`);
    }
  }

  console.log("\n✨ 完了");
  console.log("\n--- ログイン情報 ---");
  for (const u of TEST_USERS) {
    console.log(`  ${u.role.padEnd(10)} ${u.email}  /  ${u.password}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
