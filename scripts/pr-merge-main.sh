#!/bin/bash
# develop→main PRのマージから、ローカルmainの追従までを1コマンドで完結させる。
# 「マージ後にgit branch -f main origin/mainを忘れる」再発防止のため、
# 手順を分割せずこのスクリプトだけを実行すること。
set -e

if [ -z "$1" ]; then
  echo "使い方: scripts/pr-merge-main.sh <PR番号>" >&2
  exit 1
fi

PR_NUM="$1"

gh pr merge "$PR_NUM" --merge
git fetch origin
git branch -f main origin/main

echo "✅ PR #$PR_NUM をマージし、ローカルmainをorigin/mainに追従させました。"
git branch -vv | grep -E '^\*?\s*main\s'
