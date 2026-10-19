#!/bin/bash
# DB変更（マイグレーション）の衝突検知。main への PR で CI が実行し、問題があればマージを止める。
#
# 背景（2026-10-12）:
#   hotfix は main に直接DB変更を入れるため、developで先に作ったDB変更より「新しい日付」のものが
#   本番に先に入る。するとdevelopリリース時、本番のDB反映（supabase db push）が
#   「最新より古い日付の未反映分がある」としてエラーで止まり、アプリだけ本番に出て障害になる。
#   また、STG（develop→hotfix の順）と本番（hotfix→develop の順）では反映順が逆になるため、
#   同じ関数・ポリシー等を両方が作り直していると、エラーなく後勝ちで中身が食い違う。
#
# 解消ルール:
#   日付が逆転したDB変更は本番に流さない。古いファイルは削除し、両方の意図を合わせた「最終形」を
#   最新日付で新規作成する。最終形は「古い分が反映済み（STG）」「未反映（本番）」のどちらから流しても
#   同じ結果になるよう if exists / if not exists 等で書く。STG側の古い記録は migration repair で外す。
#
# 使い方:
#   scripts/check-migrations.sh order    <base>                  … 日付の逆転を検知（gitのみ・DB不要）
#   scripts/check-migrations.sh converge <base> [supabase workdir] … 書き直し時に本番順とSTG順で構造が一致するか
#     converge はローカルDBを reset するので、開発中のローカルDBに対しては実行しないこと。
#     手元では scripts/hotfix-local-db.sh で立てた別インスタンスの workdir を渡す。
set -euo pipefail

MODE="${1:-}"
BASE="${2:-origin/main}"
WORKDIR="${3:-.}"
DIR=supabase/migrations

cd "$(git rev-parse --show-toplevel)"

version_of() { basename "$1" | cut -d_ -f1; }

case "$MODE" in
order)
  # base（本番）に入っている最新の日付
  LATEST=$(git ls-tree --name-only "$BASE" "$DIR/" | xargs -n1 basename | cut -d_ -f1 | sort | tail -1)
  # このブランチで新たに増えるDB変更のうち、本番の最新以前の日付のもの
  INVERTED=()
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    if [[ ! "$(version_of "$f")" > "$LATEST" ]]; then INVERTED+=("$f"); fi
  done < <(git diff --no-renames --name-only --diff-filter=A "$BASE" HEAD -- "$DIR/")

  if [ ${#INVERTED[@]} -eq 0 ]; then
    echo "✅ DB変更の日付逆転なし（本番の最新: $LATEST）"
    exit 0
  fi
  echo "❌ 本番の最新（$LATEST）より古い日付のDB変更があります。このままでは本番のDB反映が止まります。"
  for f in "${INVERTED[@]}"; do echo "   - $f"; done
  echo "   → 古いファイルを削除し、最終形を最新日付で新規作成してください（scripts/check-migrations.sh 冒頭の解消ルール）。"
  exit 1
  ;;

converge)
  # このブランチの中で削除されたDB変更（＝最終形に書き直した古い分。STGには反映済み）
  # --no-renames: 古い分と最終形の中身が似ていると git は「名前変更」と扱い、削除として拾えないため
  # --full-history: CI の HEAD は PR のマージコミット（main＋develop）。削除済みファイルはマージコミットにも
  #   main 側の親にも無いため、git は既定の履歴簡略化で main 側だけを辿り、develop 側の削除コミットを
  #   見落とす（2026-10-19 PR#176 で「bad revision '^:…'」になった）。全経路を辿らせる
  DELETED=$(git log --full-history --no-renames --diff-filter=D --name-only --format= "$BASE..HEAD" -- "$DIR/" | sort -u)
  if [ -z "$DELETED" ]; then
    echo "✅ 書き直したDB変更なし（本番とSTGの反映順は同じ。構造比較は不要）"
    exit 0
  fi

  PROJECT_ID=$(grep -E '^project_id' "$WORKDIR/supabase/config.toml" | cut -d'"' -f2)
  dump() { docker exec "supabase_db_$PROJECT_ID" pg_dump -U postgres --schema-only --no-owner postgres | grep -vE "^\\\\(un)?restrict "; }
  OUT=$(mktemp -d)
  RESTORED=""
  cleanup() { for f in $RESTORED; do rm -f "$WORKDIR/$f"; done; RESTORED=""; }
  trap cleanup EXIT

  # DBを作り直す。ログにDB変更のエラー（ERROR: …）が無い失敗は、CLI側の不定期な失敗
  # （"error running container: exit 1" やコンテナ再起動の応答待ちタイムアウト）なので最大3回やり直す。
  # 2026-10-12 手元で通常の reset が2回に1回程度この形で失敗することを確認済み。
  reset_db() {
    local log="$OUT/reset-$1.log"
    for attempt in 1 2 3; do
      supabase db reset --workdir "$WORKDIR" >"$log" 2>&1 && return 0
      grep -q "ERROR:" "$log" && break
      echo "   ⏳ DBの作り直しが途中で失敗（DB変更以外の要因・${attempt}回目）。やり直します"
      sleep 10
    done
    tail -30 "$log"
    return 1
  }

  echo "🔄 本番の順番（書き直し後のファイルのみ）でDBを作り直します"
  reset_db prod || { echo "❌ 本番の順番でDB変更を流せません（上のログ）。"; exit 1; }
  dump >"$OUT/prod.sql"

  echo "🔄 STGの順番（削除した古いDB変更も含めて日付順）でDBを作り直します"
  for f in $DELETED; do
    c=$(git log -1 --full-history --no-renames --diff-filter=D --format=%H "$BASE..HEAD" -- "$f")
    [ -n "$c" ] || { echo "❌ $f を削除したコミットが見つかりません"; exit 1; }
    git show "$c^:$f" >"$WORKDIR/$f"
    RESTORED="$RESTORED $f"
    echo "   + $f"
  done
  if ! reset_db stg; then
    echo "❌ STGの順番でDB変更を流すとエラーになります。最終形が「古い分が反映済み」の状態から流せる書き方になっていません。"
    exit 1
  fi
  dump >"$OUT/stg.sql"

  cleanup
  reset_db restore || echo "⚠️ 判定後のDBの作り直しに失敗しました。ローカルDBを作り直してください。"

  if diff -u "$OUT/stg.sql" "$OUT/prod.sql" >"$OUT/diff.txt"; then
    echo "✅ 本番の順番とSTGの順番で、DBの構造が一致しました"
    exit 0
  fi
  cat "$OUT/diff.txt"
  echo "❌ 本番の順番とSTGの順番で、DBの構造が食い違います（上の差分。- がSTG、+ が本番）。"
  exit 1
  ;;

*)
  echo "使い方: scripts/check-migrations.sh order|converge <base> [supabase workdir]" >&2
  exit 1
  ;;
esac
