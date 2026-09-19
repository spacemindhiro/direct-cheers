#!/bin/bash
# PRのmainマージ → ローカルmainの追従 → hotfix分のdevelop同期 までを1コマンドで完結させる。
# 「マージ後の手順を忘れる」再発防止のため、手順を分割せずこのスクリプトだけを実行すること。
#   2026-07: git branch -f main origin/main の忘れ ×2 → スクリプト化
#   2026-09-20: hotfix→main マージ後の develop 同期を3件放置 → develop同期もスクリプトに統合
set -e

if [ -z "$1" ]; then
  echo "使い方: scripts/pr-merge-main.sh <PR番号>" >&2
  exit 1
fi

PR_NUM="$1"
cd "$(git rev-parse --show-toplevel)"

PR_TITLE=$(gh pr view "$PR_NUM" --json title --jq .title)

gh pr merge "$PR_NUM" --merge
git fetch origin
git branch -f main origin/main

echo "✅ PR #$PR_NUM をマージし、ローカルmainをorigin/mainに追従させました。"
git branch -vv | grep -E '^\*?\s*main\s'

# ---------------------------------------------------------------------------
# develop同期（hotfixルートの必須事後処理・先祖返り防止）
#
# mainにあってdevelopにない「非マージコミット」があれば、それはhotfix由来。
# develop→main のPRならmain側の差分はマージコミットだけなのでここはスキップされる。
#
# 同期は必ず --no-ff。ff-only同期はdevelop/mainが同一コミットに収束して
# グラフが閉じる＋Vercel無駄ビルドの副作用があるため禁止（2026-07-08撤回）。
# 作業中のブランチ・未コミット変更を汚さないよう一時worktreeで実行する。
# ---------------------------------------------------------------------------
UNSYNCED=$(git log --no-merges --oneline origin/develop..origin/main)
if [ -z "$UNSYNCED" ]; then
  echo "✅ develop同期: mainの変更はすべてdevelopに含まれています（同期不要）。"
  exit 0
fi

echo "🔄 develop同期: mainにあってdevelopにない変更を取り込みます。"
echo "$UNSYNCED"

WT=$(mktemp -d)
trap 'git worktree remove --force "$WT" >/dev/null 2>&1 || true' EXIT
git worktree add --quiet --detach "$WT" origin/develop

(
  cd "$WT"
  if ! git merge --no-ff origin/main -m "Merge main into develop: hotfix同期 PR #$PR_NUM $PR_TITLE"; then
    git merge --abort || true
    echo "❌ develop同期でコンフリクトが発生しました。mainマージ自体は完了しています。" >&2
    echo "   origin/main を develop に手動でマージして解消し、push してください。" >&2
    exit 1
  fi
  git push origin HEAD:develop
)

# ローカルdevelopも追従させる（チェックアウト中なら ff、そうでなければポインタ移動）
if [ "$(git rev-parse --abbrev-ref HEAD)" = "develop" ]; then
  git merge --ff-only origin/develop || echo "⚠️ ローカルdevelopのff追従に失敗（未コミット変更と衝突）。origin/developは同期済みです。" >&2
else
  git branch -f develop origin/develop
fi

echo "✅ develop同期: mainの変更をdevelopに取り込みました。"
git log --oneline -1 origin/develop
REMAIN=$(git log --no-merges --oneline origin/develop..origin/main | wc -l | tr -d ' ')
echo "   main→develop 未同期コミット: $REMAIN 件"
