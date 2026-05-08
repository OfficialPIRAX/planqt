# Flora-Pi: Smartes Bewässerungssystem für die Terrasse

> **Konzeptblatt für Claude Code** — alle Spezifikationen, Architektur und Implementierungsdetails für die schrittweise Entwicklung des Projekts.

---

## 1. Projektziel

Eine **lokale, im Heimnetz laufende Bewässerungs-App** für Cedrics Terrasse in Epe (Gronau, NRW). Das System misst Bodenfeuchte, Temperatur und Licht über Zigbee-Sensoren, kombiniert das mit Wetterdaten von Open-Meteo (FAO Penman-Monteith ET₀) und gibt der Familie via PWA mit Push-Benachrichtigungen konkrete Gießempfehlungen — inklusive Pflegetipp und Pflanzenbild.

**Phase 1 (jetzt):** Messen, berechnen, empfehlen, benachrichtigen.
**Phase 2 (später):** Automatisches Gießen über Magnetventile/Zigbee-Smart-Plugs.

---

## 2. Technischer Stack

### Backend
- **Laufzeit:** Node.js 20 LTS
- **Sprache:** TypeScript (strict mode)
- **Framework:** Fastify (modern, performant, gutes TypeScript-Support)
- **Datenbank:** SQLite via `better-sqlite3` (synchron, schnell, perfekt für Pi mit 2 GB RAM)
- **MQTT-Client:** `mqtt` npm-Paket
- **Web Push:** `web-push` npm-Paket (VAPID)
- **Wetter:** Open-Meteo API (https://open-meteo.com), kein API-Key nötig
- **Validierung:** Zod
- **Scheduler:** `node-cron` für periodische Berechnung

### Frontend
- **Build:** Vite
- **Framework:** React 18 + TypeScript
- **Styling:** Tailwind CSS
- **Komponenten:** shadcn/ui (inkl. Dialog, Sheet, DropdownMenu, AlertDialog für Modals)
- **State:** TanStack Query (React Query) für Server-State + automatisches Refetching
- **Live-Daten:** Server-Sent Events (SSE) für Echtzeit-Sensor-Updates
- **Routing:** React Router (mit Modal-Routen via `useSearchParams` für Sharable URLs)
- **PWA:** `vite-plugin-pwa` (Workbox-basiert)
- **Charts:** Recharts (für Verlaufsgraphen der Sensordaten)
- **Bild-Upload:** Drag-&-Drop + Kamera-Capture (HTML5 `<input capture>`)
- **Animation:** Framer Motion (sparsam, für Modal-Ein-/Ausblendungen und Live-Update-Pulse)

### Infrastruktur (auf dem Raspberry Pi 5)
- **OS:** Raspberry Pi OS Lite (64-bit)
- **MQTT-Broker:** Mosquitto (nativ installiert, nicht Docker, RAM-Schonung)
- **Zigbee-Bridge:** Zigbee2MQTT (nativ installiert)
- **Process Manager:** PM2 oder systemd
- **Reverse Proxy:** Caddy (automatisches HTTPS via mkcert für Heimnetz, oder einfach HTTP intern)

### Hardware
- Raspberry Pi 5, 2 GB RAM
- Sonoff ZBDongle-E (Silicon Labs EFR32MG21, Zigbee 3.0)
- Tuya Zigbee 4-in-1 Bodensensor (Bodenfeuchte, Temp, Luftfeuchte, Licht)
- USB-Stick als Bootmedium (statt SD-Karte, für Langlebigkeit)
- FRITZ!Box als Heimnetz-Router

---

## 3. Architektur

```
┌─────────────────────────────────────────────────────────────┐
│  FRITZ!Box (Router, 2. Stock)                              │
└──────────────┬─────────────────────────┬───────────────────┘
               │ WLAN                    │ WLAN
               │                         │
       ┌───────▼─────────┐       ┌──────▼────────────┐
       │ Familie-Geräte  │       │ Raspberry Pi 5    │
       │ (iPhones, Macs) │       │                   │
       │ → PWA im Browser│       │  ┌──────────────┐ │
       └─────────────────┘       │  │ Mosquitto    │ │
                                 │  │ (MQTT)       │ │
                                 │  └──────┬───────┘ │
                                 │         │         │
                                 │  ┌──────▼───────┐ │
                                 │  │ Zigbee2MQTT  │ │
                                 │  └──────┬───────┘ │
                                 │         │         │
                                 │  ┌──────▼───────┐ │      Zigbee
                                 │  │ Sonoff Stick │◄├──────────────┐
                                 │  └──────────────┘ │              │
                                 │                   │              │
                                 │  ┌──────────────┐ │      ┌───────▼────────┐
                                 │  │ Backend      │ │      │ Tuya 4-in-1    │
                                 │  │ Node.js +    │ │      │ Bodensensor    │
                                 │  │ Fastify      │ │      │ (Terrasse)     │
                                 │  └──────┬───────┘ │      └────────────────┘
                                 │         │         │
                                 │  ┌──────▼───────┐ │
                                 │  │ SQLite DB    │ │
                                 │  └──────────────┘ │
                                 │                   │      ┌────────────┐
                                 │  ┌──────────────┐ │ HTTPS│ Open-Meteo │
                                 │  │ PWA Statics  │◄├──────►│ API        │
                                 │  └──────────────┘ │      └────────────┘
                                 └───────────────────┘
```

**Datenfluss:**
1. Tuya-Sensor sendet alle ~30 min Werte via Zigbee an den Sonoff-Stick
2. Zigbee2MQTT veröffentlicht die Werte als MQTT-Message: `zigbee2mqtt/sensor_terrasse_1`
3. Backend abonniert dieses Topic und schreibt Werte in SQLite
4. Cron-Job alle 60 min: Wetter abrufen (Open-Meteo), ET₀-Berechnung pro Pflanze, Gießempfehlung erzeugen
5. Bei neuer Empfehlung: Web Push an alle abonnierten Geräte
6. PWA zeigt Dashboard, Verlauf, Empfehlungen, Bedienoberfläche

---

## 4. Datenmodelle

### TypeScript Interfaces (Shared zwischen Frontend & Backend)

```typescript
// shared/types.ts

export type PlantCategory = 'vegetable' | 'herb' | 'flower' | 'shrub' | 'tree' | 'other';

export type GrowthStage = 'initial' | 'mid' | 'late';

export interface PlantTemplate {
  id: string;
  name: string;                    // z.B. "Tomate"
  scientificName?: string;          // "Solanum lycopersicum"
  category: PlantCategory;
  cropCoefficient: {                // Kc-Werte nach FAO-56
    initial: number;                // z.B. 0.6
    mid: number;                    // z.B. 1.15
    late: number;                   // z.B. 0.7
  };
  optimalSoilMoisture: {            // Bodenfeuchte in %
    min: number;                    // z.B. 40
    max: number;                    // z.B. 70
    critical: number;               // z.B. 25 (darunter: kritisch)
  };
  rootDepthCm: number;              // typische Wurzeltiefe
  careTips: string[];               // ["Morgens gießen", "Mulchen", ...]
  isOutdoor: boolean;               // Terrassen/Garten-Pflanze?
}

export interface Plant {
  id: string;                       // UUID
  name: string;                     // "Meine Tomate links"
  templateId: string;               // ref → PlantTemplate
  potVolumeLiters: number;          // z.B. 10
  potDiameterCm: number;            // für ET-Berechnung (Topfoberfläche)
  imageUrl?: string;                // hochgeladenes Bild
  sensorId?: string;                // ref → Sensor (optional, falls noch keiner zugeordnet)
  location: string;                 // "Terrasse links"
  plantedAt: string;                // ISO date, für Wachstumsphase
  currentStage: GrowthStage;        // wird automatisch oder manuell gesetzt
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Sensor {
  id: string;                       // Zigbee IEEE address (z.B. "0x00158d0001abcdef")
  friendlyName: string;             // wie in Zigbee2MQTT konfiguriert
  type: 'tuya_4in1' | 'tuya_soil' | 'other';
  plantId?: string;                 // welche Pflanze überwacht der Sensor?
  calibration?: {
    dryValue: number;               // Rohwert bei trocken (%)
    wetValue: number;               // Rohwert bei nass (%)
  };
  lastSeenAt?: string;
  batteryLevel?: number;            // %
  createdAt: string;
}

export interface SensorReading {
  id: number;                       // auto-increment
  sensorId: string;
  timestamp: string;                // ISO
  soilMoisture: number;             // %, nach Kalibrierung
  soilMoistureRaw?: number;         // %, unkalibriert (für Debugging)
  temperature?: number;             // °C
  humidity?: number;                // %
  light?: number;                   // lux
  battery?: number;                 // %
}

export interface WateringRecommendation {
  id: string;
  plantId: string;
  createdAt: string;
  recommendedAmountMl: number;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  reason: string;                   // menschenlesbar: "Boden bei 28%, kein Regen erwartet"
  weatherSnapshot: {                // was wussten wir zum Zeitpunkt der Empfehlung
    et0NextDay: number;             // mm
    rainNext24h: number;            // mm
    tempMax: number;                // °C
    tempMin: number;                // °C
  };
  acknowledged: boolean;
  wateredAt?: string;
  wateredBy?: string;               // "Cedric" / "Mama" / "Papa" (optional)
  wateredAmountMl?: number;         // tatsächlich gegossene Menge
  expiredAt?: string;               // wenn veraltet (z.B. >24h alt)
}

export interface PushSubscription {
  id: string;
  deviceLabel: string;              // "Cedrics iPhone", vom User gesetzt
  endpoint: string;
  p256dh: string;
  auth: string;
  preferences: {
    wateringNeeded: boolean;        // Default: true
    criticalAlerts: boolean;        // Default: true
    dailyStatus: boolean;           // Default: true (täglich morgens)
    sensorOffline: boolean;         // Default: true
    lowBattery: boolean;            // Default: true
  };
  createdAt: string;
}
```

### SQLite Schema

```sql
-- migrations/001_initial.sql

CREATE TABLE plant_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  scientific_name TEXT,
  category TEXT NOT NULL,
  kc_initial REAL NOT NULL,
  kc_mid REAL NOT NULL,
  kc_late REAL NOT NULL,
  moisture_min REAL NOT NULL,
  moisture_max REAL NOT NULL,
  moisture_critical REAL NOT NULL,
  root_depth_cm REAL NOT NULL,
  care_tips TEXT NOT NULL,        -- JSON-Array
  is_outdoor INTEGER NOT NULL
);

CREATE TABLE plants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  template_id TEXT REFERENCES plant_templates(id),
  pot_volume_liters REAL NOT NULL,
  pot_diameter_cm REAL NOT NULL,
  image_url TEXT,
  sensor_id TEXT REFERENCES sensors(id),
  location TEXT,
  planted_at TEXT NOT NULL,
  current_stage TEXT NOT NULL DEFAULT 'mid',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sensors (
  id TEXT PRIMARY KEY,             -- IEEE address
  friendly_name TEXT NOT NULL,
  type TEXT NOT NULL,
  plant_id TEXT,
  cal_dry_value REAL,
  cal_wet_value REAL,
  last_seen_at TEXT,
  battery_level REAL,
  created_at TEXT NOT NULL
);

CREATE TABLE sensor_readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sensor_id TEXT NOT NULL REFERENCES sensors(id),
  timestamp TEXT NOT NULL,
  soil_moisture REAL,
  soil_moisture_raw REAL,
  temperature REAL,
  humidity REAL,
  light REAL,
  battery REAL
);

CREATE INDEX idx_readings_sensor_time ON sensor_readings(sensor_id, timestamp);

CREATE TABLE watering_recommendations (
  id TEXT PRIMARY KEY,
  plant_id TEXT NOT NULL REFERENCES plants(id),
  created_at TEXT NOT NULL,
  recommended_amount_ml REAL NOT NULL,
  urgency TEXT NOT NULL,
  reason TEXT NOT NULL,
  weather_snapshot TEXT NOT NULL,  -- JSON
  acknowledged INTEGER NOT NULL DEFAULT 0,
  watered_at TEXT,
  watered_by TEXT,
  watered_amount_ml REAL,
  expired_at TEXT
);

CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  device_label TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  preferences TEXT NOT NULL,        -- JSON
  created_at TEXT NOT NULL
);
```

---

## 5. Berechnungslogik (Kern-Algorithmus)

### Eingaben pro Pflanze
- Aktuelle Bodenfeuchte (vom Sensor, kalibriert)
- Pflanzen-Template (Kc, Optimal-Range, Wurzeltiefe)
- Topf-Geometrie (Volumen, Durchmesser)
- Wachstumsstufe (initial/mid/late)
- Wetter heute & nächste 24h (von Open-Meteo: ET₀, Niederschlag, Temp)

### Algorithmus (Pseudo-Code)

```typescript
function calculateWateringRecommendation(
  plant: Plant,
  template: PlantTemplate,
  latestReading: SensorReading,
  weather: WeatherForecast
): WateringRecommendation | null {

  // 1. Sofortige Notfall-Prüfung
  if (latestReading.soilMoisture < template.optimalSoilMoisture.critical) {
    return {
      urgency: 'critical',
      recommendedAmountMl: estimateRefillAmount(plant, template),
      reason: `Boden kritisch trocken (${latestReading.soilMoisture}%)`,
      ...
    };
  }

  // 2. Kc je nach Wachstumsphase
  const kc = template.cropCoefficient[plant.currentStage];

  // 3. Tatsächliche Verdunstung (ETc) für die nächsten 24h
  const eTc = weather.et0Next24h * kc; // mm

  // 4. Topf-Oberfläche (m²)
  const radius = plant.potDiameterCm / 2 / 100; // m
  const surfaceArea = Math.PI * radius * radius;

  // 5. Wasserverlust durch Verdunstung in Litern
  // 1 mm Wasserhöhe × 1 m² = 1 Liter
  const waterLossLiters = eTc * surfaceArea;

  // 6. Erwartete Wasserzufuhr durch Regen (bei Outdoor-Pflanzen)
  const rainGainLiters = template.isOutdoor
    ? weather.rainNext24h * surfaceArea
    : 0;

  // 7. Netto-Bedarf
  const netNeedLiters = Math.max(0, waterLossLiters - rainGainLiters);
  const netNeedMl = netNeedLiters * 1000;

  // 8. Aktueller Feuchte-Status: muss überhaupt gegossen werden?
  const isInOptimalRange = latestReading.soilMoisture >= template.optimalSoilMoisture.min;

  // 9. Empfehlung erzeugen
  if (netNeedMl < 50 && isInOptimalRange) {
    return null; // kein Gießen nötig
  }

  let urgency: Urgency = 'low';
  if (latestReading.soilMoisture < template.optimalSoilMoisture.min) urgency = 'medium';
  if (latestReading.soilMoisture < (template.optimalSoilMoisture.min + template.optimalSoilMoisture.critical) / 2) urgency = 'high';

  let reason = '';
  if (latestReading.soilMoisture < template.optimalSoilMoisture.min) {
    reason = `Bodenfeuchte ${latestReading.soilMoisture}% (optimal ${template.optimalSoilMoisture.min}-${template.optimalSoilMoisture.max}%)`;
  } else {
    reason = `Hoher Verdunstungsbedarf erwartet (${eTc.toFixed(1)} mm/Tag)`;
  }
  if (rainGainLiters > 0) {
    reason += `, ${weather.rainNext24h}mm Regen abgezogen`;
  }

  return {
    plantId: plant.id,
    recommendedAmountMl: Math.round(netNeedMl),
    urgency,
    reason,
    weatherSnapshot: {
      et0NextDay: weather.et0Next24h,
      rainNext24h: weather.rainNext24h,
      tempMax: weather.tempMax,
      tempMin: weather.tempMin
    },
    ...
  };
}
```

### Open-Meteo API-Aufruf
```
https://api.open-meteo.com/v1/forecast?
  latitude=52.18
  &longitude=7.07
  &daily=et0_fao_evapotranspiration,precipitation_sum,temperature_2m_max,temperature_2m_min
  &hourly=precipitation_probability
  &timezone=Europe/Berlin
  &forecast_days=2
```

### Scheduler
- **Alle 30 min:** Sensor-Werte werden via MQTT empfangen und gespeichert (event-driven)
- **Stündlich:** Berechnung der Empfehlungen, ggf. Push-Versand
- **Täglich um 7:00:** Status-Push (alle Pflanzen-Übersicht)
- **Täglich um 0:00:** Cleanup (alte Empfehlungen >48h alt → expired)

### Anti-Spam-Logik
- Eine neue Push-Empfehlung wird nur gesendet, wenn:
  - Es noch keine offene (unacknowledged) Empfehlung für die Pflanze gibt, ODER
  - Die Urgency höher geworden ist (z.B. medium → critical)
- Maximal 1 normale Push-Benachrichtigung pro Pflanze pro 6 Stunden
- Critical-Alerts immer durchlassen

---

## 6. MQTT-Topic-Struktur

### Eingehend (von Zigbee2MQTT)
```
zigbee2mqtt/<friendly_name>                      # Sensor-Werte
zigbee2mqtt/bridge/state                          # Bridge-Status
zigbee2mqtt/bridge/devices                        # Geräte-Liste
zigbee2mqtt/bridge/event                          # Pairing/Joining Events
```

### Ausgehend (vom Backend)
```
flora/recommendation/<plant_id>                   # Neue Empfehlung
flora/watered/<plant_id>                          # Pflanze wurde gegossen
flora/sensor/<sensor_id>/calibrate                # Kalibrierungs-Befehl
```

---

## 7. REST-API Endpunkte

### Pflanzen
- `GET /api/plants` — alle Pflanzen
- `POST /api/plants` — neue Pflanze anlegen (multipart, mit Bild-Upload)
- `GET /api/plants/:id` — Detail
- `PUT /api/plants/:id` — bearbeiten
- `DELETE /api/plants/:id` — löschen
- `GET /api/plants/:id/history?days=7` — Sensor-Verlauf
- `GET /api/plants/:id/recommendations` — Empfehlungs-Historie

### Pflanzen-Templates
- `GET /api/templates` — alle Vorlagen
- `GET /api/templates/:id` — Detail einer Vorlage

### Sensoren
- `GET /api/sensors` — alle Sensoren (auto-discovered via Z2M)
- `PUT /api/sensors/:id` — friendly name, plant assignment, calibration
- `POST /api/sensors/:id/test-reading` — manuelle Messung erzwingen (falls möglich)

### Empfehlungen
- `GET /api/recommendations?status=open` — offene Empfehlungen
- `POST /api/recommendations/:id/acknowledge` — gesehen, ignorieren
- `POST /api/recommendations/:id/watered` — Body: `{ amountMl?, by? }`

### Push
- `GET /api/push/vapid-public-key` — für Frontend-Subscription
- `POST /api/push/subscribe` — neue Subscription registrieren
- `DELETE /api/push/subscriptions/:id` — abmelden
- `PUT /api/push/subscriptions/:id/preferences` — Settings ändern
- `POST /api/push/test` — Test-Notification an gewähltes Gerät

### Wetter
- `GET /api/weather/current` — aktuelles Wetter Epe
- `GET /api/weather/forecast` — Vorhersage 2 Tage

### Dashboard
- `GET /api/dashboard/summary` — alle Kennzahlen für die Übersichtsseite

### Live-Updates (Server-Sent Events)
- `GET /api/events` — SSE-Stream für Echtzeit-Updates
  - Event `sensor.reading` — neue Messwerte eingetroffen
  - Event `recommendation.created` — neue Gießempfehlung
  - Event `plant.created/updated/deleted` — Pflanzen-Änderungen
  - Event `sensor.offline/online` — Sensor-Status-Änderungen
  - Frontend abonniert diesen Stream automatisch und invalidiert Query-Caches

### Bilder
- `POST /api/upload/image` — Bild-Upload (multipart, max 5 MB, JPEG/PNG/WebP)
- Bilder werden gespeichert in `backend/uploads/<uuid>.jpg`, statisch ausgeliefert unter `/uploads/...`

---

## 8. Frontend — Dashboard-zentriertes Design

Die App folgt einem **modernen, modal-basierten UX-Pattern** (wie Linear, Notion, Vercel Dashboard): Das Dashboard ist die zentrale Drehscheibe, alle Aktionen passieren in Slide-Over-Sheets oder Modals — keine harten Seitenwechsel. Routes existieren trotzdem für Deep-Linking und Sharability.

### Routen

| Route | Zweck |
|---|---|
| `/` | **Dashboard** — Hauptseite, alle Pflanzen als interaktive Karten, Live-Updates |
| `/?plant=<id>` | Dashboard mit geöffnetem Pflanzen-Detail-Sheet (deeplink-fähig) |
| `/?plant=<id>&edit=1` | Detail-Sheet im Edit-Modus |
| `/?new=1` | Dashboard mit "Pflanze hinzufügen"-Sheet |
| `/sensors` | Sensor-Verwaltung (Kalibrierung, Zuordnung) |
| `/templates` | Pflanzen-Vorlagen-Bibliothek (read-only) |
| `/settings` | Push-Settings, Geräte, Test-Push |

### Dashboard-Layout

```
┌────────────────────────────────────────────────────────┐
│ 🌱 Flora-Pi               🌤 22°C  [Settings] [+ Neu] │ ← Header
├────────────────────────────────────────────────────────┤
│                                                        │
│ ⚠️ 2 Pflanzen brauchen Wasser                         │ ← Banner bei offenen Empfehlungen
│                                                        │
├────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐            │
│  │  [Bild]  │  │  [Bild]  │  │  [Bild]  │            │
│  │ Tomate   │  │ Basilikum│  │ Lavendel │            │ ← PlantCards
│  │ 🟢 65%   │  │ 🔴 22% ⚠️│  │ 🟡 38%   │            │
│  │ vor 3min │  │ vor 8min │  │ vor 5min │            │
│  └──────────┘  └──────────┘  └──────────┘            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐            │
│  │   [+]    │  │ Olive    │  │ Rosmarin │            │
│  │  Neue    │  │ 🟢 52%   │  │ 🟢 41%   │            │
│  │  Pflanze │  │ vor 2min │  │ vor 6min │            │
│  └──────────┘  └──────────┘  └──────────┘            │
└────────────────────────────────────────────────────────┘
```

### Interaktionen auf dem Dashboard

**PlantCard — Klick-Verhalten:**
- **Klick auf Karte (oder Bild)** → öffnet Slide-Over-Sheet von rechts mit voller Detailansicht
- **Klick aufs Bild im Detail-Sheet** → Lightbox (Vollbild)
- **3-Punkte-Menü oben rechts auf Karte** → Dropdown mit:
  - "Habe gegossen" (sofort-Aktion mit Toast-Bestätigung)
  - "Bearbeiten"
  - "Sensor zuordnen" (falls keiner)
  - "Löschen" (mit AlertDialog-Bestätigung)
- **Long-Press auf Mobile** → gleiches Kontextmenü
- **Status-Ampel oben links auf Karte:**
  - 🟢 Grün: Bodenfeuchte im Optimum
  - 🟡 Gelb: Grenzwertig, ggf. bald gießen
  - 🔴 Rot mit Pulse-Animation: Akut gießen
  - ⚫ Grau: Sensor offline / keine Daten
- **Live-Update-Indikator:** Wenn neue Sensor-Daten reinkommen, kurz dezent pulsieren

**"+ Neue Pflanze" Karte:**
- Immer als erste/letzte Karte sichtbar (gestrichelter Rand, +-Icon)
- Klick → öffnet Add-Plant-Sheet von rechts

### Detail-Sheet (Slide-Over von rechts, ~600px breit)

```
┌──────────────────────────────────────┐
│ ✕                          [⋮ Menü] │
├──────────────────────────────────────┤
│                                      │
│       [  GROSSES BILD  ]             │ ← klickbar = Lightbox
│                                      │
│  Tomate "Links vor der Tür"          │ ← Name (inline editierbar)
│  📍 Terrasse links                   │
│  🌱 Tomate (Vorlage)                 │
│                                      │
├──────────────────────────────────────┤
│ Aktuelle Werte (vor 3 min)           │
│ ┌────────┐ ┌────────┐ ┌────────┐    │
│ │  🟢    │ │ 🌡️ 21° │ │ 💡 8k  │    │
│ │ 65%    │ │        │ │ lux    │    │
│ │ Boden  │ │ Temp   │ │ Licht  │    │
│ └────────┘ └────────┘ └────────┘    │
├──────────────────────────────────────┤
│ Letzte Empfehlung                    │
│ [Vor 2h: 200ml gießen] [✓ Gegossen] │
├──────────────────────────────────────┤
│ Verlauf (7 Tage) [1d|7d|30d]        │
│ [─── Recharts-Liniendiagramm ───]   │
├──────────────────────────────────────┤
│ Pflegetipps                          │
│ • Morgens gießen, nicht abends      │
│ • Blätter trocken halten            │
├──────────────────────────────────────┤
│ [Bearbeiten]              [Löschen] │
└──────────────────────────────────────┘
```

**Inline-Editing im Detail-Sheet:**
- Name, Standort, Notizen direkt anklickbar → werden zu Input-Feldern
- Speichern bei Blur oder Enter
- Bild austauschbar per Drag-&-Drop oder Klick

### Add-Plant-Sheet (Slide-Over)

Mehrstufiger Wizard in einem Sheet:

**Schritt 1 — Foto:**
- Großes Drop-Feld für Bild-Upload
- Auf Mobile: "Foto aufnehmen" Button (öffnet Kamera) UND "Aus Galerie wählen"
- Auf Desktop: Drag-&-Drop oder Datei-Auswahl
- Vorschau direkt anzeigen, ggf. zuschneiden

**Schritt 2 — Vorlage wählen:**
- Suchfeld + Kategorie-Filter (Gemüse, Kräuter, Zierpflanzen, ...)
- Karten-Grid mit Vorlagen (Bild + Name)
- Option "Eigene Pflanze (ohne Vorlage)"

**Schritt 3 — Details:**
- Name (vorgeschlagen aus Vorlage, editierbar)
- Standort (z.B. "Terrasse links")
- Topfgröße: Volumen (L) + Durchmesser (cm) — mit Visual-Helper
- Wachstumsphase (initial/mid/late) — Default: mid
- Notizen (optional)

**Schritt 4 — Sensor zuordnen (optional):**
- Liste verfügbarer (noch nicht zugeordneter) Sensoren
- "Später zuordnen" überspringen-Option
- Wenn zugeordnet: Live-Wert wird sofort angezeigt zur Verifizierung

**Schritt 5 — Bestätigung:**
- Übersicht aller Eingaben
- "Speichern"-Button → Schließt Sheet, neue Karte erscheint im Dashboard mit Pulse-Animation

### Edit-Plant-Sheet
Identisches Layout zum Add-Wizard, aber:
- Vorausgefüllt mit aktuellen Werten
- Alle Schritte direkt zugänglich (Tab-Navigation), nicht stufenweise
- Bild austauschbar
- "Sensor entfernen / wechseln" Option

### Delete-Flow
- AlertDialog (zentriert, modal):
  - "Pflanze »Tomate Links« wirklich löschen?"
  - "Alle Sensordaten und Empfehlungen für diese Pflanze werden ebenfalls gelöscht."
  - "Der zugeordnete Sensor wird wieder frei."
  - Buttons: [Abbrechen] [Löschen] (Löschen-Button rot)
- Nach Löschen: Toast-Notification "Pflanze gelöscht. [Rückgängig]" (10 Sek Undo möglich)

### Live-Daten-Verhalten

- **TanStack Query** mit `staleTime: 30s`, `refetchOnWindowFocus: true`
- **SSE-Subscription** (`/api/events`) im Root-Layout:
  - Bei `sensor.reading` Event → invalidiere `plants` und `dashboard.summary` Queries
  - Bei `recommendation.created` → Toast + Banner-Update + Queries invalidieren
  - Bei `plant.*` → Queries invalidieren (für Multi-Device-Sync, falls Mama auf ihrem Handy etwas hinzufügt)
- **Visueller Live-Indikator:** Im Header ein kleiner grüner Dot, der bei jedem eingehenden Event kurz pulsiert ("verbunden, aktiv")
- **Reconnect-Logik:** Wenn SSE-Verbindung abreißt, automatischer Reconnect mit exponential backoff
- **Optimistic Updates:** "Habe gegossen"-Klick ändert UI sofort, Server-Sync im Hintergrund

### Wichtige Komponenten (Bauanleitung)

- `<PlantCard plant={...} reading={...} recommendation={...} onClick onAction />` — Dashboard-Kachel mit allen Interaktionen
- `<PlantDetailSheet plantId>` — Slide-Over mit Detail-Ansicht, kontrolliert via URL `?plant=<id>`
- `<PlantFormSheet mode="add"|"edit" plantId?>` — Wizard / Form für Hinzufügen/Bearbeiten
- `<PlantImageUploader value onChange>` — Drag-&-Drop, Kamera-Capture, Vorschau, Zuschneiden
- `<MoistureGauge value min max critical>` — visueller Bodenfeuchte-Ring oder -Balken
- `<SensorChart sensorId range>` — Recharts-Verlauf mit Zoom
- `<LiveDot connected />` — kleiner Indikator im Header
- `<RecommendationBanner recommendations />` — gelbe/rote Bar bei offenen Empfehlungen
- `<DeleteConfirmDialog plant onConfirm />` — AlertDialog mit Sicherheitsabfrage

### Empty-States
- **Dashboard ohne Pflanzen:** Großer Hero mit "Willkommen! Lege deine erste Pflanze an" + Button
- **Dashboard ohne Sensoren:** Hinweis-Banner "Du hast noch keine Sensoren gepairt" mit Link zu Z2M-Frontend (separater Port, läuft eh auf dem Pi)
- **Detail-Sheet ohne Verlauf:** "Noch keine Messwerte aufgezeichnet"

### Mobile-Optimierungen
- Sheets werden auf Mobile zu **Bottom-Sheets** (slide von unten, 90% Höhe)
- Karten-Grid wird zu Single-Column unter ~640px
- Touch-Targets ≥ 44px (Apple-HIG)
- Bilder werden lazy-loaded
- Kamera-Capture ist auf Mobile primary, Galerie-Auswahl secondary

---

## 9. Repo-Struktur

```
flora-pi/
├── README.md
├── .gitignore
├── .editorconfig
├── package.json                        # Root, mit npm workspaces
├── pnpm-workspace.yaml                 # ODER pnpm workspace
├── tsconfig.base.json
│
├── shared/                             # Shared types zwischen FE/BE
│   ├── package.json
│   └── src/
│       └── types.ts
│
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   ├── src/
│   │   ├── index.ts                    # Entry, Fastify Setup
│   │   ├── config.ts                   # Env-Loader
│   │   ├── db/
│   │   │   ├── connection.ts
│   │   │   └── migrations/
│   │   │       └── 001_initial.sql
│   │   ├── routes/
│   │   │   ├── plants.ts
│   │   │   ├── templates.ts
│   │   │   ├── sensors.ts
│   │   │   ├── recommendations.ts
│   │   │   ├── push.ts
│   │   │   ├── weather.ts
│   │   │   ├── dashboard.ts
│   │   │   └── upload.ts
│   │   ├── services/
│   │   │   ├── mqtt.ts                 # MQTT-Client, Sensor-Listener
│   │   │   ├── weather.ts              # Open-Meteo Wrapper
│   │   │   ├── irrigation.ts           # ET₀-Berechnung
│   │   │   ├── push.ts                 # Web Push Sender
│   │   │   ├── scheduler.ts            # Cron Jobs
│   │   │   └── upload.ts               # File-Handling
│   │   ├── data/
│   │   │   └── plant-templates.json    # Seed-Daten
│   │   └── utils/
│   │       └── logger.ts
│   └── uploads/                        # Hochgeladene Bilder (im .gitignore)
│
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   ├── public/
│   │   ├── icons/                      # PWA-Icons (192, 512, maskable)
│   │   └── manifest.webmanifest
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── routes/
│       │   ├── Dashboard.tsx
│       │   ├── PlantNew.tsx
│       │   ├── PlantDetail.tsx
│       │   ├── PlantEdit.tsx
│       │   ├── Sensors.tsx
│       │   ├── Recommendations.tsx
│       │   ├── Templates.tsx
│       │   └── Settings.tsx
│       ├── components/
│       │   ├── ui/                     # shadcn/ui Komponenten
│       │   ├── PlantCard.tsx
│       │   ├── MoistureGauge.tsx
│       │   ├── SensorChart.tsx
│       │   └── WateringPrompt.tsx
│       ├── lib/
│       │   ├── api.ts                  # fetch-Wrapper
│       │   ├── push.ts                 # Web Push Subscription Logic
│       │   └── format.ts               # Date/Number Formatter (de-DE)
│       └── service-worker.ts           # PWA + Push Handler
│
└── deploy/
    ├── README.md                       # Deployment-Anleitung
    ├── install-pi.sh                   # einmaliges Setup-Skript für den Pi
    ├── deploy.sh                       # vom Mac aus deployen (rsync + restart)
    ├── flora-pi.service                # systemd-Service
    └── mosquitto.conf                  # MQTT-Konfig
```

---

## 10. Pflanzendatenbank — Seed-Templates (Phase 1)

`backend/src/data/plant-templates.json` enthält initial 30 Vorlagen, kategorisiert. Beispiele:

```json
[
  {
    "id": "tomato",
    "name": "Tomate",
    "scientificName": "Solanum lycopersicum",
    "category": "vegetable",
    "cropCoefficient": { "initial": 0.6, "mid": 1.15, "late": 0.7 },
    "optimalSoilMoisture": { "min": 50, "max": 75, "critical": 30 },
    "rootDepthCm": 40,
    "careTips": [
      "Morgens gießen, nicht abends",
      "Blätter trocken halten (Mehltau-Gefahr)",
      "Regelmäßig ausgeizen",
      "Stickstoff-betonte Düngung in der Wachstumsphase"
    ],
    "isOutdoor": true
  },
  {
    "id": "basil",
    "name": "Basilikum",
    "scientificName": "Ocimum basilicum",
    "category": "herb",
    "cropCoefficient": { "initial": 0.6, "mid": 1.0, "late": 0.8 },
    "optimalSoilMoisture": { "min": 45, "max": 70, "critical": 25 },
    "rootDepthCm": 20,
    "careTips": [
      "Sonnig stellen",
      "Spitzen regelmäßig ernten für buschigen Wuchs",
      "Nicht zu nass halten — Wurzelfäule",
      "Nicht in direkter Mittagssonne im Hochsommer"
    ],
    "isOutdoor": true
  },
  {
    "id": "lavender",
    "name": "Lavendel",
    "category": "shrub",
    "cropCoefficient": { "initial": 0.4, "mid": 0.7, "late": 0.5 },
    "optimalSoilMoisture": { "min": 25, "max": 50, "critical": 15 },
    "rootDepthCm": 50,
    "careTips": [
      "Sehr trockenheitsverträglich",
      "Gut drainierter Boden ist wichtig",
      "Nach Blüte zurückschneiden",
      "Eher zu wenig als zu viel gießen"
    ],
    "isOutdoor": true
  },
  {
    "id": "olive",
    "name": "Olivenbaum",
    "category": "tree",
    "cropCoefficient": { "initial": 0.65, "mid": 0.7, "late": 0.7 },
    "optimalSoilMoisture": { "min": 30, "max": 55, "critical": 20 },
    "rootDepthCm": 60,
    "careTips": [
      "Frostfrei überwintern (unter +5°C kritisch)",
      "Trockenheit verträgt er, Staunässe nicht",
      "Im Sommer reichlich, im Winter sparsam gießen",
      "Spezial-Olivendünger im Frühjahr"
    ],
    "isOutdoor": true
  },
  {
    "id": "unknown",
    "name": "Unbekannte Pflanze",
    "category": "other",
    "cropCoefficient": { "initial": 0.7, "mid": 1.0, "late": 0.8 },
    "optimalSoilMoisture": { "min": 40, "max": 65, "critical": 25 },
    "rootDepthCm": 30,
    "careTips": ["Generischer Wert — bitte spezifizieren falls möglich"],
    "isOutdoor": true
  }
]
```

**Weitere zu generierende Templates:** Geranie, Petunie, Hortensie, Rosmarin, Thymian, Salbei, Petersilie, Schnittlauch, Erdbeere, Paprika, Chili, Gurke, Zucchini, Buchsbaum, Kirschlorbeer, Bambus, Hibiskus, Oleander, Bougainvillea, Zitronenbaum, Feige, Margerite, Sonnenblume, Fuchsie, Salat, Rucola.

---

## 11. Konfiguration

### `backend/.env.example`
```
# Server
PORT=3000
NODE_ENV=production

# Datenbank
DATABASE_PATH=./data/flora.db

# MQTT
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_TOPIC_PREFIX=zigbee2mqtt

# Wetter (Epe / Gronau, NRW)
WEATHER_LATITUDE=52.18
WEATHER_LONGITUDE=7.07
WEATHER_TIMEZONE=Europe/Berlin

# Web Push (VAPID)
# Generieren mit: npx web-push generate-vapid-keys
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_CONTACT=mailto:cedric@example.com

# Upload-Pfad
UPLOAD_DIR=./uploads
MAX_UPLOAD_MB=5

# Logging
LOG_LEVEL=info
```

---

## 12. Entwicklungs-Workflow

### Lokal auf dem Mac
```bash
# Einmalig
cd ~/Projekte
# Repo erstellen oder klonen (Git-Setup ist bereits am Mac vorhanden)
cd flora-pi
pnpm install
cp backend/.env.example backend/.env
# .env editieren: VAPID-Keys generieren, ggf. MQTT-URL anpassen

# Backend & Frontend parallel starten
pnpm dev   # läuft auf localhost:3000 (BE) und localhost:5173 (FE)
```

Für lokale MQTT/Z2M-Tests kann am Mac ein Mosquitto via Homebrew laufen, oder man entwickelt zunächst nur mit Mock-Sensor-Daten.

### Deployment auf den Pi
```bash
# Erstinstallation auf dem Pi (einmalig)
ssh cedric@flora-pi.local
cd /home/cedric
# Code aufs Pi bringen (git clone vom eigenen Remote oder rsync vom Mac)
cd flora-pi
bash deploy/install-pi.sh

# Updates vom Mac aus
bash deploy/deploy.sh   # rsync + systemctl restart
```

---

## 13. Iterationsplan / Milestones

### Milestone 0 — Pi-Hardware-Setup (Donnerstag, manuell)
- Pi 5 mit Raspberry Pi OS Lite per USB-Stick booten
- SSH-Zugang einrichten
- Mosquitto installieren und absichern
- Zigbee2MQTT installieren, Sonoff-Stick erkennen
- Tuya-Sensor pairen, erste Werte sehen

### Milestone 1 — Backend-Skelett
- Repo-Setup, TypeScript, Fastify, SQLite, Migrations
- MQTT-Client, der Sensor-Daten in DB schreibt
- `GET /api/sensors`, `GET /api/sensors/:id/readings`

### Milestone 2 — Pflanzen & Templates
- Plant-Templates Seed-Daten laden
- CRUD-API für Plants
- Sensor-Pflanzen-Zuordnung

### Milestone 3 — Wetter & Berechnung
- Open-Meteo Service
- ET₀-Berechnung
- Empfehlungs-Service mit Cron-Job
- Anti-Spam-Logik

### Milestone 4 — Frontend Dashboard (Kern der App)
- Vite + React + Tailwind + shadcn/ui Setup
- Dashboard mit interaktiven PlantCards
- Slide-Over Sheets: Detail-Ansicht, Add-Plant-Wizard, Edit-Form
- Bild-Upload mit Kamera-Capture und Drag-&-Drop
- Inline-Editing im Detail-Sheet
- Delete-Flow mit Bestätigung und Undo
- Status-Ampeln, MoistureGauge, RecommendationBanner
- API-Anbindung mit TanStack Query
- SSE-Verbindung für Live-Updates
- Empty-States, Loading-Skelette, Error-Boundaries
- Mobile: Bottom-Sheets, Touch-optimiert

### Milestone 5 — PWA & Push
- Service Worker, Manifest, Icons
- Web Push Subscription Flow
- Push-Versand bei neuen Empfehlungen
- Settings-Seite mit Geräte-Verwaltung

### Milestone 6 — Polish
- Recharts-Verlaufsgraphen
- Tägliche Status-Push
- Sensor-Kalibrierung-UI
- "Wer hat gegossen?" Feature
- Fehler-States, Loading-States, Empty-States
- Mobile Optimierungen

### Milestone 7 (Phase 2, später) — Automatik
- Zigbee-Smart-Plug oder Magnetventil-Integration
- Automatisches Gießen mit Manual-Override
- Mengenbegrenzung, Sicherheits-Cutoff

---

## 14. Wichtige Hinweise für Claude Code

### Commit-Konvention
- Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`
- Pro Milestone mehrere kleine Commits, am Ende ein Tag

### Code-Stil
- TypeScript strict
- ESLint + Prettier
- Funktionale Komponenten in React, keine Class-Components
- Async/await statt Promise-Chains
- Aussagekräftige Variablennamen, deutsch oder englisch konsistent (lieber englisch, weil Tooling)

### Tests
- Vitest fürs Backend
- Mindestens für die ET₀-Berechnung Unit-Tests
- E2E mit Playwright optional in Phase 2

### Sicherheit
- Helmet für Security-Header
- Input-Validierung mit Zod auf jeder Route
- CORS nur für lokales Netz
- Keine Secrets im Repo, alles via .env

### Performance
- SQLite WAL-Mode
- Pagination bei Sensor-Readings (Default 1000 letzte)
- Index auf häufige Queries

---

## 15. Hardware-Konfiguration (für Phase 0 / Pi-Setup)

### Standort der Hardware
- **Raspberry Pi 5:** drinnen am Fenster zur Terrasse (trocken, am Strom, nahe Sensoren)
- **Sonoff ZBDongle-E:** über USB-Verlängerung 1m vom Pi entfernt (wegen USB-3-Funkstörung)
- **Tuya 4-in-1 Sensor:** im jeweiligen Topf auf der Terrasse

### Netzwerk
- Heimnetz via FRITZ!Box (2. Stock)
- Pi per WLAN
- mDNS-Hostname: `flora-pi.local` (Bonjour, funktioniert auf Mac/iPhone/Android nativ)

### Verschlüsselung & HTTPS im Heimnetz
- Erstmal nur HTTP — für PWA-Push reicht das **NICHT**, weil Service Worker HTTPS verlangen
- Lösung: lokales TLS mit `mkcert` oder Caddy mit lokaler CA
- Oder: Tailscale/Cloudflare Tunnel für echtes HTTPS (wäre dann doch externer Zugriff – im Konzept Phase 1 nicht vorgesehen)
- **Empfehlung:** Caddy + mkcert für `https://flora-pi.local` — Familie installiert einmalig das Root-Cert auf jedem Gerät

---

## 16. Offene Punkte (vor Entwicklungsstart zu klären)

- [ ] Optionale Pflanzen-Liste, falls Cedric spezielle Templates haben will
- [ ] Sensor-Kalibrierung (kommt erst, wenn der Tuya-Sensor da ist und im echten Topf gemessen wurde)
- [ ] HTTPS-Strategie endgültig entscheiden (mkcert oder einfacher Workaround)

---

## Anhang A: Open-Meteo Response-Beispiel

```json
{
  "latitude": 52.2,
  "longitude": 7.05,
  "timezone": "Europe/Berlin",
  "daily": {
    "time": ["2026-05-08", "2026-05-09"],
    "et0_fao_evapotranspiration": [3.4, 4.1],
    "precipitation_sum": [0.0, 2.3],
    "temperature_2m_max": [22.5, 24.0],
    "temperature_2m_min": [11.0, 13.5]
  }
}
```

## Anhang B: Beispiel Push-Payload

```json
{
  "title": "🌿 Tomate links braucht Wasser",
  "body": "Bodenfeuchte 32%, ca. 250 ml gießen",
  "icon": "/icons/icon-192.png",
  "badge": "/icons/badge.png",
  "image": "/uploads/tomate-links.jpg",
  "data": {
    "plantId": "abc123",
    "recommendationId": "rec789",
    "url": "/plants/abc123"
  },
  "actions": [
    { "action": "watered", "title": "Habe gegossen" },
    { "action": "snooze", "title": "Später" }
  ]
}
```
