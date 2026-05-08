# PlanQT — Raspberry Pi Deployment

## Erstinstallation

```bash
# Repo auf den Pi klonen/kopieren nach /home/cedric/planqt
./deploy/install-pi.sh
```

Das Script installiert Node.js 20, Mosquitto, baut das Projekt und richtet den systemd-Service ein.

## Updates deployen (vom Mac)

```bash
./deploy/deploy.sh              # Standard: cedric@pi-cedric.local
./deploy/deploy.sh user@host    # Alternativer Host
```

## Zigbee2MQTT Konfiguration

### External Converter (HOBEIAN ZG-303Z)

Die Bodenfeuchtesensoren benötigen einen Custom Converter. `install-pi.sh` kopiert die Datei automatisch nach `/opt/zigbee2mqtt/data/external_converters/`.

In `/opt/zigbee2mqtt/data/configuration.yaml` muss folgender Eintrag vorhanden sein:

```yaml
external_converters:
  - external_converters/zg303z.js
```

Nach der Änderung Zigbee2MQTT neu starten:

```bash
sudo systemctl restart zigbee2mqtt
```

### Sensor-Zuordnung

Sensoren werden automatisch erkannt, sobald sie dem Z2M-Netzwerk beitreten. Im PlanQT-Dashboard können sie dann einer Pflanze zugewiesen werden.

## VAPID-Keys (Push-Benachrichtigungen)

```bash
cd /home/cedric/planqt
npx web-push generate-vapid-keys
```

Die generierten Keys in `backend/.env` eintragen:

```
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_MAILTO=mailto:cedric.epe@gmail.com
```

Danach Service neu starten:

```bash
sudo systemctl restart flora-pi
```

## Service-Verwaltung

```bash
sudo systemctl status flora-pi    # Status prüfen
sudo systemctl restart flora-pi   # Neu starten
sudo journalctl -u flora-pi -f    # Logs verfolgen
```
