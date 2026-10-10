#!/bin/bash
# PRのmainマージ → ローカルmainの追従 → hotfix分のdevelop同期 → マージ済みブランチの削除 までを1コマンドで完結させる。
# 「マージ後の手順を忘れる」再発防止のため、手順を分割せずこのスクリプトだけを実行すること。
#   2026-07: git branch -f main origin/main の忘れ ×2 → スクリプト化
#   2026-09-20: hotfix→main マージ後の develop 同期を3件放置 → develop同期もスクリプトに統合
#   2026-10-10: マージ済みブランチが手元24本・GitHub30本溜まった → ブランチ削除もスクリプトに統合
set -e

if [ -z "$1" ]; then
  echo "使い方: scripts/pr-merge-main.sh <PR番号>" >&2
  exit 1
fi

PR_NUM="$1"
cd "$(git rev-parse --show-toplevel)"

# ローカルブランチを origin に追従させる。
# 別worktreeでチェックアウト中のブランチは git branch -f が拒否されるため、そのworktree内で ff する。
# （2026-10-10: worktreeから実行して develop の追従が失敗し、ローカルdevelopが取り残された）
sync_local() {
  local br="$1" wt
  wt=$(git worktree list --porcelain | awk -v ref="refs/heads/$br" '/^worktree /{p=substr($0,10)} $0=="branch "ref{print p}')
  if [ -n "$wt" ]; then
    git -C "$wt" merge --ff-only --quiet "origin/$br" ||
      echo "⚠️ ローカル$br のff追従に失敗（$wt の未コミット変更と衝突）。origin/$br は更新済みです。" >&2
  else
    git branch -f "$br" "origin/$br"
  fi
}

PR_TITLE=$(gh pr view "$PR_NUM" --json title --jq .title)

gh pr merge "$PR_NUM" --merge
git fetch origin
sync_local main

echo "✅ PR #$PR_NUM をマージし、ローカルmainをorigin/mainに追従させました。"
git branch -vv | grep -E '^[*+]?\s*main\s'

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
else
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

  git fetch origin --quiet
  sync_local develop

  echo "✅ develop同期: mainの変更をdevelopに取り込みました。"
  git log --oneline -1 origin/develop
  REMAIN=$(git log --no-merges --oneline origin/develop..origin/main | wc -l | tr -d ' ')
  echo "   main→develop 未同期コミット: $REMAIN 件"
fi

# ---------------------------------------------------------------------------
# マージ済みブランチの削除
#
# main と develop の両方に入ったブランチは役割を終えているので、GitHubと手元の両方から消す。
# ただし main/develop の first-parent 上のコミットを指すブランチは消さない。main から切った直後で
# まだコミットのない作業ブランチがこれに当たり、「両方に入っている」判定をすり抜けてしまうため。
# マージ済みブランチの先端はマージコミットの2番目の親なので first-parent 上には来ない。
# ---------------------------------------------------------------------------
git fetch origin --prune --quiet
FIRST_PARENTS=$({ git rev-list --first-parent origin/main; git rev-list --first-parent origin/develop; } | sort -u)

is_merged_both() {
  local sha
  sha=$(git rev-parse "$1")
  git merge-base --is-ancestor "$sha" origin/main &&
    git merge-base --is-ancestor "$sha" origin/develop &&
    ! grep -qx "$sha" <<<"$FIRST_PARENTS"
}

REMOTE_DONE=()
for br in $(git for-each-ref --format='%(refname:lstrip=3)' refs/remotes/origin); do
  case "$br" in main | develop | HEAD) continue ;; esac
  if is_merged_both "origin/$br"; then REMOTE_DONE+=("$br"); fi
done
if [ ${#REMOTE_DONE[@]} -gt 0 ]; then
  git push origin --delete "${REMOTE_DONE[@]}"
  git fetch origin --prune --quiet
fi

LOCAL_DONE=()
for br in $(git for-each-ref --format='%(refname:short)' refs/heads); do
  case "$br" in main | develop) continue ;; esac
  if is_merged_both "$br"; then LOCAL_DONE+=("$br"); fi
done

# マージしたPRのブランチをチェックアウトしたまま実行するのが普通なので、本体の作業ツリーなら develop に戻す。
# 作業用worktreeの中から実行している場合は、そのworktree自体が役目を終えているので削除を案内する。
CURRENT=$(git rev-parse --abbrev-ref HEAD)
IN_LINKED_WT=false
[ "$(git rev-parse --git-dir)" != "$(git rev-parse --git-common-dir)" ] && IN_LINKED_WT=true
if printf '%s\n' "${LOCAL_DONE[@]}" | grep -qx "$CURRENT" && ! $IN_LINKED_WT; then
  if git diff --quiet && git diff --cached --quiet; then
    git switch --quiet develop && echo "↩️ マージ済みの $CURRENT から develop に切り替えました。"
  fi
fi

LEFT=()
for br in "${LOCAL_DONE[@]}"; do
  git branch -d "$br" >/dev/null 2>&1 || LEFT+=("$br")
done

DELETED_LOCAL=$((${#LOCAL_DONE[@]} - ${#LEFT[@]}))
echo "🧹 マージ済みブランチ削除: GitHub ${#REMOTE_DONE[@]} 本・手元 $DELETED_LOCAL 本"
for br in "${REMOTE_DONE[@]}"; do echo "   - $br"; done
for br in "${LEFT[@]}"; do
  wt=$(git worktree list --porcelain | awk -v ref="refs/heads/$br" '/^worktree /{p=substr($0,10)} $0=="branch "ref{print p}')
  if [ -n "$wt" ]; then
    echo "⚠️ $br は作業用worktree（$wt）で使用中のため手元に残しました。" >&2
    echo "   片付け: git worktree remove \"$wt\" && git branch -d $br" >&2
  else
    echo "⚠️ $br を手元から削除できませんでした（git branch -d が拒否。チェックアウト中か、現在のブランチに未取り込み）。" >&2
    echo "   develop に切り替えてから再実行: git branch -d $br" >&2
  fi
done
