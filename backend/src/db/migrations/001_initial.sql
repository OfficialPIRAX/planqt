CREATE TABLE IF NOT EXISTS plant_templates (
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
  care_tips TEXT NOT NULL,
  is_outdoor INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS plants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  template_id TEXT REFERENCES plant_templates(id),
  pot_volume_liters REAL NOT NULL,
  pot_diameter_cm REAL NOT NULL,
  image_url TEXT,
  sensor_id TEXT,
  location TEXT,
  planted_at TEXT NOT NULL,
  current_stage TEXT NOT NULL DEFAULT 'mid',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sensors (
  id TEXT PRIMARY KEY,
  friendly_name TEXT NOT NULL,
  type TEXT NOT NULL,
  plant_id TEXT,
  cal_dry_value REAL,
  cal_wet_value REAL,
  last_seen_at TEXT,
  battery_level REAL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sensor_readings (
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

CREATE INDEX IF NOT EXISTS idx_readings_sensor_time ON sensor_readings(sensor_id, timestamp);

CREATE TABLE IF NOT EXISTS watering_recommendations (
  id TEXT PRIMARY KEY,
  plant_id TEXT NOT NULL REFERENCES plants(id),
  created_at TEXT NOT NULL,
  recommended_amount_ml REAL NOT NULL,
  urgency TEXT NOT NULL,
  reason TEXT NOT NULL,
  weather_snapshot TEXT NOT NULL,
  acknowledged INTEGER NOT NULL DEFAULT 0,
  watered_at TEXT,
  watered_by TEXT,
  watered_amount_ml REAL,
  expired_at TEXT
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  device_label TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  preferences TEXT NOT NULL,
  created_at TEXT NOT NULL
);
