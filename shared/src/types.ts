export type PlantCategory = 'vegetable' | 'herb' | 'flower' | 'shrub' | 'tree' | 'other';

export type GrowthStage = 'initial' | 'mid' | 'late';

export type Urgency = 'low' | 'medium' | 'high' | 'critical';

export interface PlantTemplate {
  id: string;
  name: string;
  scientificName?: string;
  category: PlantCategory;
  cropCoefficient: {
    initial: number;
    mid: number;
    late: number;
  };
  optimalSoilMoisture: {
    min: number;
    max: number;
    critical: number;
  };
  rootDepthCm: number;
  careTips: string[];
  isOutdoor: boolean;
}

export interface Plant {
  id: string;
  name: string;
  templateId: string;
  potVolumeLiters: number;
  potDiameterCm: number;
  imageUrl?: string;
  sensorId?: string;
  location: string;
  plantedAt: string;
  currentStage: GrowthStage;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Sensor {
  id: string;
  friendlyName: string;
  type: 'tuya_4in1' | 'tuya_soil' | 'other';
  plantId?: string;
  calibration?: {
    dryValue: number;
    wetValue: number;
  };
  lastSeenAt?: string;
  batteryLevel?: number;
  createdAt: string;
}

export interface SensorReading {
  id: number;
  sensorId: string;
  timestamp: string;
  soilMoisture: number;
  soilMoistureRaw?: number;
  temperature?: number;
  humidity?: number;
  light?: number;
  battery?: number;
}

export interface WeatherSnapshot {
  et0NextDay: number;
  rainNext24h: number;
  tempMax: number;
  tempMin: number;
}

export interface WateringRecommendation {
  id: string;
  plantId: string;
  createdAt: string;
  recommendedAmountMl: number;
  urgency: Urgency;
  reason: string;
  weatherSnapshot: WeatherSnapshot;
  acknowledged: boolean;
  wateredAt?: string;
  wateredBy?: string;
  wateredAmountMl?: number;
  expiredAt?: string;
}

export interface PushSubscription {
  id: string;
  deviceLabel: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  preferences: PushPreferences;
  createdAt: string;
}

export interface PushPreferences {
  wateringNeeded: boolean;
  criticalAlerts: boolean;
  dailyStatus: boolean;
  sensorOffline: boolean;
  lowBattery: boolean;
}

export interface WeatherForecast {
  et0Next24h: number;
  rainNext24h: number;
  tempMax: number;
  tempMin: number;
  precipitationProbability: number[];
}

export interface DashboardSummary {
  plants: (Plant & {
    template?: PlantTemplate;
    latestReading?: SensorReading;
    openRecommendation?: WateringRecommendation;
    sensor?: Sensor;
  })[];
  weather: {
    tempCurrent?: number;
    description: string;
    et0Today: number;
    rainToday: number;
  };
  alertCount: number;
}

export type SSEEvent =
  | { type: 'sensor.reading'; data: SensorReading }
  | { type: 'recommendation.created'; data: WateringRecommendation }
  | { type: 'plant.created'; data: Plant }
  | { type: 'plant.updated'; data: Plant }
  | { type: 'plant.deleted'; data: { id: string } }
  | { type: 'sensor.offline'; data: { sensorId: string } }
  | { type: 'sensor.online'; data: { sensorId: string } };
