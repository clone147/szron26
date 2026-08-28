#!/bin/bash
# Furtka dev: magic-link do strefy szron.tech dla agenta Claude (tylko laptop Tomka).
# Token żyje w ~/.secrets (SZRON_DEV_LOGIN_TOKEN); tu nie ma sekretów.
set -e
TOKEN=$(grep '^SZRON_DEV_LOGIN_TOKEN=' ~/.secrets | tail -1 | cut -d= -f2)
[ -n "$TOKEN" ] || { echo "Brak SZRON_DEV_LOGIN_TOKEN w ~/.secrets" >&2; exit 1; }
curl -s -X POST "https://sttluvcbucpxzbcsuigw.supabase.co/functions/v1/dev-login" \
  -H "Authorization: Bearer sb_publishable_X5xi2HxbmVnbxmCNd8us4Q_Dr6eXvo0" -H "content-type: application/json" \
  -d "{\"token\":\"$TOKEN\"}"
echo
