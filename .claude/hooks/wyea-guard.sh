#!/bin/bash
# Blocks Edit/Write calls whose new text adds an em dash, an en dash or a blocklisted name.
INPUT=$(cat)
NEW=$(echo "$INPUT" | jq -r '[.tool_input.content?, .tool_input.new_string?] | map(select(. != null)) | join("\n")')
[ -z "$NEW" ] && exit 0

EM=$(printf '\342\200\224')
EN=$(printf '\342\200\223')
if printf '%s' "$NEW" | LC_ALL=C grep -q -e "$EM" -e "$EN"; then
  echo "Blocked: em or en dash in new text. Use a comma, colon or period." >&2
  exit 2
fi

LIST="$CLAUDE_PROJECT_DIR/.claude/blocklist.local.txt"
if [ -s "$LIST" ] && printf '%s' "$NEW" | grep -q -i -F -f "$LIST"; then
  echo "Blocked: new text contains a name on the blocklist." >&2
  exit 2
fi
exit 0
