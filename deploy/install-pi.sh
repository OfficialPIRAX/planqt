#!/usr/bin/env bash
set -euo pipefail

echo "=== Flora-Pi: Erstinstallation auf dem Raspberry Pi ==="
echo ""

# Node.js 20 LTS
if ! command -v node &>/dev/null; then
  echo ">> Node.js 20 LTS installieren..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  echo ">> Node.js $(node -v) bereits installiert"
fi

# Mosquitto MQTT Broker
if ! command -v mosquitto &>/dev/null; then
  echo ">> Mosquitto installieren..."
  sudo apt-get install -y mosquitto mosquitto-clients
  sudo cp /home/cedric/flora-pi/deploy/mosquitto.conf /etc/mosquitto/conf.d/flora-pi.conf
  sudo systemctl enable mosquitto
  sudo systemctl restart mosquitto
else
  echo ">> Mosquitto bereits installiert"
fi

# Projektverzeichnis
cd /home/cedric/flora-pi

# Dependencies installieren
echo ">> npm install..."
npm install --production

# Backend bauen
echo ">> Backend bauen..."
npm -w shared run build
npm -w backend run build

# Frontend bauen
echo ">> Frontend bauen..."
npm -w frontend run build

# Upload-Verzeichnis
mkdir -p backend/uploads backend/data

# .env erstellen falls nicht vorhanden
if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
  echo ">> backend/.env erstellt — bitte VAPID-Keys generieren:"
  echo "   cd /home/cedric/flora-pi && npx web-push generate-vapid-keys"
fi

# systemd Service installieren
echo ">> systemd Service einrichten..."
sudo cp deploy/flora-pi.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable flora-pi
sudo systemctl start flora-pi

echo ""
echo "=== Flora-Pi ist installiert und läuft! ==="
echo "    Erreichbar unter: http://$(hostname).local:3000"
echo ""
echo "Nächste Schritte:"
echo "  1. VAPID-Keys generieren: npx web-push generate-vapid-keys"
echo "  2. Keys in backend/.env eintragen"
echo "  3. Zigbee2MQTT konfigurieren (separater Prozess)"
echo "  4. sudo systemctl restart flora-pi"
