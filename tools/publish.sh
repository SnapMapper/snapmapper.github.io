#!/bin/sh
# Publish the committed app to https://snapmapper.github.io (GitHub Pages).
#
# Copies the files of the current commit (HEAD) into the Pages repository, leaving out the
# project brief and local tool settings, commits under the GitHub no-reply address and pushes.
# Bump VERSION in sw.js first, so installed iPads pick up the update.
#
#   sh tools/publish.sh "Short description of the change"

set -eu

MESSAGE="${1:?Give a short description of the change}"
REPO="SnapMapper/snapmapper.github.io"
AUTHOR_NAME="IMH097"
AUTHOR_EMAIL="180410218+IMH097@users.noreply.github.com"
EXCLUDE="BRIEF.md .claude"

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
if [ -n "$(git status --porcelain)" ]; then
  echo "Commit your changes first: only the committed version is published." >&2
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
gh repo clone "$REPO" "$WORK/site" -- --quiet
cd "$WORK/site"
git rm -rq --ignore-unmatch . >/dev/null
(cd "$ROOT" && git archive HEAD) | tar -x -C "$WORK/site"
for path in $EXCLUDE; do rm -rf "$WORK/site/$path"; done
touch .nojekyll
git add -A
if git diff --cached --quiet; then
  echo "Nothing to publish: the site already matches this commit."
  exit 0
fi
git -c user.name="$AUTHOR_NAME" -c user.email="$AUTHOR_EMAIL" commit -qm "$MESSAGE"
git push -q origin main
echo "Published $(grep "const VERSION" sw.js | sed -E "s/.*'(.*)'.*/\1/") to https://snapmapper.github.io (live in about a minute)."
