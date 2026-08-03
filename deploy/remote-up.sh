#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
echo "[1] docker compose pull/up..."
docker compose -f docker-compose.demo.yml pull
docker compose -f docker-compose.demo.yml up -d
echo "[2] wait backend..."
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/api/v1/pages 2>/dev/null || echo 0)
  if [[ "$code" == "200" || "$code" == "401" ]]; then
    echo "  API ready http=$code"
    break
  fi
  sleep 2
  if [[ "$i" == "60" ]]; then
    echo "timeout waiting for API"
    docker compose -f docker-compose.demo.yml logs --tail=40 backend
    exit 1
  fi
done
echo "[3] install demos..."
bash ./install-demos.sh
echo ""
echo "OK: http://$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}'):8080/"
echo "Login: owner / owner123"
