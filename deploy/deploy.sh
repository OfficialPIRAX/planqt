#!/usr/bin/env bash
set -euo pipefail

PI_HOST="${1:-cedric@flora-pi.local}"
PI_DIR="/home/cedric/flora-pi"

echo "=== Flora-Pi: Deployment auf $PI_HOST ==="

echo ">> Dateien synchronisieren..."
rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='backend/data' \
  --exclude='backend/uploads' \
  --exclude='backend/.env' \
  --exclude='.idea' \
  ./ "$PI_HOST:$PI_DIR/"

echo ">> Auf dem Pi: Dependencies & Build..."
ssh "$PI_HOST" "cd $PI_DIR && npm install --production && npm -w shared run build && npm -w backend run build && npm -w frontend run build"

echo ">> Service neu starten..."
ssh "$PI_HOST" "sudo systemctl restart flora-pi"

echo ""
echo "=== Deployment abgeschlossen! ==="
echo "    http://flora-pi.local:3000"
