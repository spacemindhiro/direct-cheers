#!/bin/bash
# DB変更を含む hotfix を、本番反映前にローカルで検証するための「2つ目のローカルSupabase」を起動・停止する。
#
# 背景（2026-10-12）:
#   Supabaseは無料プランで本番・STGの2面しかなく、STGのDBにはdevelop側の未リリースDB変更が先に入っている。
#   そのため「本番の構造＋hotfixのDB変更」の状態はSTGでは作れない。Dockerで別インスタンスを立てて検証する。
#   開発用のローカルSupabase（ポート5432x）とは別プロジェクト・別ポート（5532x）なので、互いに干渉しない。
#
# 使い方（hotfix の worktree の中で実行する。本体の作業ツリーでは実行できない）:
#   scripts/hotfix-local-db.sh start   … 起動。worktree の .env.test と .env.development.local を新DBに向ける
#   scripts/hotfix-local-db.sh stop    … 停止してデータ破棄。.env.test を元に戻す
#   起動後のアプリ: npm run dev -- -p 3001 （本体の dev サーバー 3000 とぶつけない）
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
if [ "$(git rev-parse --git-dir)" = "$(git rev-parse --git-common-dir)" ]; then
  echo "❌ 本体の作業ツリーでは実行できません。hotfix の worktree の中で実行してください。" >&2
  exit 1
fi

WD=.local-db
BRANCH=$(git rev-parse --abbrev-ref HEAD)
PROJECT_ID="dc-$(echo "$BRANCH" | tr -c 'a-zA-Z0-9\n' '-' | cut -c1-40)"

case "${1:-}" in
start)
  mkdir -p "$WD/supabase"
  # ポートを 543xx → 553xx、アプリのURLを 3000 → 3001 にずらし、プロジェクト名をブランチ固有にする
  sed -E \
    -e "s/^project_id = .*/project_id = \"$PROJECT_ID\"/" \
    -e 's/= 543([0-9]{2})$/= 553\1/' \
    -e 's#(localhost|127\.0\.0\.1):3000#\1:3001#g' \
    supabase/config.toml >"$WD/supabase/config.toml"
  for d in migrations templates functions; do
    [ -e "supabase/$d" ] && ln -sfn "../../supabase/$d" "$WD/supabase/$d"
  done

  supabase start --workdir "$WD"

  eval "$(supabase status --workdir "$WD" -o env | grep -E '^(API_URL|PUBLISHABLE_KEY|SECRET_KEY)=')"

  # テスト（vitest は .env.test を読む）の接続先を新DBへ
  sed -i '' -E \
    -e "s#^NEXT_PUBLIC_SUPABASE_URL=.*#NEXT_PUBLIC_SUPABASE_URL=$API_URL#" \
    -e 's#^NEXT_PUBLIC_SITE_URL=.*#NEXT_PUBLIC_SITE_URL=http://localhost:3001#' \
    .env.test

  # dev サーバーは .env.local（STG向き）より .env.development.local を優先する。.env.local には触らない
  cat >.env.development.local <<EOF
# scripts/hotfix-local-db.sh が生成。stop で削除される
NEXT_PUBLIC_SUPABASE_URL=$API_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=$SECRET_KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3001
EOF

  echo "✅ 2つ目のローカルSupabaseを起動しました（$PROJECT_ID / $API_URL）"
  echo "   アプリ: npm run dev -- -p 3001   メール受信箱: http://127.0.0.1:55324"
  ;;

stop)
  supabase stop --workdir "$WD" --no-backup || true
  sed -i '' -E \
    -e 's#^NEXT_PUBLIC_SUPABASE_URL=.*#NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321#' \
    -e 's#^NEXT_PUBLIC_SITE_URL=.*#NEXT_PUBLIC_SITE_URL=http://localhost:3000#' \
    .env.test
  rm -rf "$WD" .env.development.local
  echo "✅ 停止し、.env.test を開発用ローカルDB向けに戻しました"
  ;;

*)
  echo "使い方: scripts/hotfix-local-db.sh start|stop" >&2
  exit 1
  ;;
esac
