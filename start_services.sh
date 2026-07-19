#!/bin/bash
# Startup script for easy_saas / lowcode portal (local + cloudflared demo-tunnel)
set -euo pipefail

ROOT=/root/saas-demo
JAR="$ROOT/backend/target/lowcode-1.0.0.jar"
DOMAIN="${SAAS_DEMO_DOMAIN:-lowcode.lazyoldlearner.win}"
PORT_FE=5173
PORT_BE=8081
# Dedicated easy_saas tunnel (NOT gc2-ttyd-backup — that has a remote connector without our routes)
DEMO_TUNNEL_ID=49cdc7da-1541-426e-a3ed-d9c0d827e391
DEMO_TUNNEL_YML=/etc/cloudflared/demo-tunnel.yml

echo "[1/5] Build backend if needed..."
if [[ ! -f "$JAR" ]] || find "$ROOT/backend/src" -newer "$JAR" | grep -q .; then
  (cd "$ROOT/backend" && env -u http_proxy -u https_proxy -u ALL_PROXY -u HTTP_PROXY -u HTTPS_PROXY mvn -q -DskipTests package)
fi

echo "[2/5] Restart backend on $PORT_BE..."
# free port by PID from ss (avoid pkill self-match)
BE_PID=$(ss -lntp 2>/dev/null | sed -n "s/.*:${PORT_BE} .*pid=\\([0-9]*\\).*/\\1/p" | head -1 || true)
if [[ -n "${BE_PID:-}" ]]; then kill "$BE_PID" 2>/dev/null || true; sleep 1; kill -9 "$BE_PID" 2>/dev/null || true; fi
nohup env -u http_proxy -u https_proxy -u ALL_PROXY -u HTTP_PROXY -u HTTPS_PROXY \
  java -jar "$JAR" --server.port=$PORT_BE \
  > "$ROOT/backend.log" 2>&1 &

echo "[3/5] Restart frontend on $PORT_FE..."
FE_PID=$(ss -lntp 2>/dev/null | sed -n "s/.*:${PORT_FE} .*pid=\\([0-9]*\\).*/\\1/p" | head -1 || true)
if [[ -n "${FE_PID:-}" ]]; then
  kill "$FE_PID" 2>/dev/null || true
  sleep 1
  kill -9 "$FE_PID" 2>/dev/null || true
fi
(cd "$ROOT/frontend" && nohup npm run dev -- --port $PORT_FE --host 0.0.0.0 > "$ROOT/frontend.log" 2>&1 &)

echo "[4/5] Wait for health..."
for i in $(seq 1 45); do
  b=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT_BE}/api/v1/pages" || true)
  f=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT_FE}/" || true)
  if [[ "$b" == "200" && "$f" == "200" ]]; then
    echo "  ready backend=$b frontend=$f"
    break
  fi
  sleep 1
  if [[ "$i" == "45" ]]; then
    echo "Timeout waiting for services (b=$b f=$f). See backend.log / frontend.log"
    exit 1
  fi
done

echo "[5/5] Ensure cloudflared demo-tunnel routes $DOMAIN -> 127.0.0.1:$PORT_FE"
if [[ -f "$DEMO_TUNNEL_YML" ]] && ! grep -q "hostname: $DOMAIN" "$DEMO_TUNNEL_YML"; then
  sed -i "/- service: http_status:404/i \  - hostname: $DOMAIN\n    service: http://127.0.0.1:$PORT_FE" "$DEMO_TUNNEL_YML"
fi
# IMPORTANT: pass tunnel UUID; -f is --overwrite-dns flag, not tunnel name
cloudflared tunnel route dns --overwrite-dns "$DEMO_TUNNEL_ID" "$DOMAIN" || true
systemctl restart cloudflared-demo.service || true

echo ""
echo "Local:   http://127.0.0.1:${PORT_FE}/  (API proxy -> :${PORT_BE})"
echo "Public:  https://${DOMAIN}/"
echo "Also:    https://tmp-5173.lazyoldlearner.win/  https://testweb.lazyoldlearner.win/"
echo "Logs:    $ROOT/backend.log  $ROOT/frontend.log"
