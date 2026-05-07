#!/usr/bin/env bash
# Proof-test: Kimi-K2.6 handles Tamil natively (no translation hop).
# Loads creds from ../.env if present so you can edit the key in one place.

set -euo pipefail

# Pick up OPENAI_* / API_KEY from .env if it exists.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -f "$ROOT/.env" ]]; then
  set -a; source "$ROOT/.env"; set +a
fi

API_KEY="${OPENAI_API_KEY:-sk-manderleschatick}"
BASE_URL="${OPENAI_BASE_URL:-https://1f156421d040-3c818a5a-54dc-4773-abfe-0206283dc9e3-caas.user-hosted-content.io.solutions/v1}"
MODEL="${OPENAI_LLM_MODEL:-moonshotai/Kimi-K2.6}"

REQ=$(cat <<'JSON'
{
  "model": "__MODEL__",
  "messages": [
    {
      "role": "system",
      "content": "You are Priya, a Rupeezy partner-program RM. Reply ONLY in Tamil (Tamil script). Keep it under 2 sentences. No English words."
    },
    {
      "role": "user",
      "content": "வணக்கம், நான் ஒரு mutual fund distributor. உங்க Rupeezy partner program-ஐ பத்தி சொல்லுங்க."
    }
  ],
  "max_tokens": 400,
  "chat_template_kwargs": {"thinking": false}
}
JSON
)
REQ="${REQ//__MODEL__/$MODEL}"

echo "POST $BASE_URL/chat/completions"
echo "model=$MODEL  thinking=false"
echo "----- request -----"
echo "$REQ"
echo "----- response -----"

# Pretty-print full JSON if jq is available, otherwise raw.
if command -v jq >/dev/null 2>&1; then
  curl -sS -m 60 -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
    -X POST "$BASE_URL/chat/completions" -d "$REQ" | jq .
else
  curl -sS -m 60 -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
    -X POST "$BASE_URL/chat/completions" -d "$REQ"
  echo
fi
