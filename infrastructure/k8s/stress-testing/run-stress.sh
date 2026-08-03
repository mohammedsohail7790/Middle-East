#!/usr/bin/env bash
# Inbound load stress — validates gateway health under churn (no outbound dial).
set -euo pipefail
GATEWAY="${GATEWAY_URL:-http://localhost:3003}"
CONCURRENCY="${CONCURRENCY:-50}"
DURATION_SEC="${DURATION_SEC:-120}"

echo "Stress test: $GATEWAY ($CONCURRENCY workers, ${DURATION_SEC}s)"
end=$((SECONDS + DURATION_SEC))
ok=0
fail=0

while [ $SECONDS -lt $end ]; do
  for i in $(seq 1 "$CONCURRENCY"); do
    curl -sf "$GATEWAY/health" >/dev/null && ok=$((ok+1)) || fail=$((fail+1)) &
  done
  wait
  curl -sf "$GATEWAY/ready" >/dev/null || echo "ready check failed"
done

echo "Complete: ok=$ok fail=$fail"
[ "$fail" -lt "$((ok / 10))" ] || exit 1
