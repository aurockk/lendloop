#!/usr/bin/env bash
# One-shot local setup for the n8n container started by docker-compose.yml:
#   1. creates the "LendLoop SMTP" credential pointing at Mailpit (no secrets: Mailpit has no auth)
#   2. imports the three workflows from n8n/workflows (mounted at /workflows)
#   3. publishes (activates) them and restarts n8n so the webhook + schedule go live
# For a real SMTP provider, create the credential in the n8n UI instead; never commit it.
set -euo pipefail
cd "$(dirname "$0")/.."

n8n() { docker compose exec -T n8n n8n "$@"; }

echo "→ Creating Mailpit SMTP credential"
docker compose exec -T n8n sh -c 'cat > /tmp/lendloop-smtp.json' <<'JSON'
[{
  "id": "lendloopMailpit1",
  "name": "LendLoop SMTP",
  "type": "smtp",
  "data": { "host": "mailpit", "port": 1025, "secure": false, "disableStartTls": true, "user": "", "password": "" }
}]
JSON
n8n import:credentials --input=/tmp/lendloop-smtp.json
docker compose exec -T n8n rm -f /tmp/lendloop-smtp.json

echo "→ Importing workflows"
n8n import:workflow --separate --input=/workflows

echo "→ Publishing workflows"
for id in lendloopErrors01 lendloopLoanEvts lendloopReminder; do
  n8n publish:workflow --id="$id"
done

docker compose restart n8n >/dev/null
echo "✓ Done. n8n: http://localhost:5678  ·  Mailpit: http://localhost:8025"
echo "  Loan events webhook: http://localhost:5678/webhook/lendloop-loan-events"
