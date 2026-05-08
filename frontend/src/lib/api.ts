import type {
  DashboardSummary,
  Plant,
  PlantTemplate,
  PushSubscription,
  Sensor,
  SensorReading,
  WateringRecommendation,
} from '@flora-pi/shared';

/* ================================================================
   Base fetch wrapper
   ================================================================ */

class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body: unknown,
  ) {
    super(`API ${status}: ${statusText}`);
    this.name = 'ApiError';
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text().catch(() => null);
    }
    throw new ApiError(res.status, res.statusText, body);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

/* ================================================================
   Dashboard
   ================================================================ */

export function fetchDashboard(): Promise<DashboardSummary> {
  return request<DashboardSummary>('/api/dashboard/summary');
}

/* ================================================================
   Plants
   ================================================================ */

export function fetchPlants(): Promise<Plant[]> {
  return request<Plant[]>('/api/plants');
}

export function createPlant(
  data: Omit<Plant, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<Plant> {
  return request<Plant>('/api/plants', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updatePlant(
  id: string,
  data: Partial<Omit<Plant, 'id' | 'createdAt' | 'updatedAt'>>,
): Promise<Plant> {
  return request<Plant>(`/api/plants/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function deletePlant(id: string): Promise<void> {
  return request<void>(`/api/plants/${id}`, { method: 'DELETE' });
}

export function fetchPlantHistory(
  id: string,
  days = 7,
): Promise<SensorReading[]> {
  return request<SensorReading[]>(`/api/plants/${id}/history?days=${days}`);
}

export function fetchPlantRecommendations(
  id: string,
): Promise<WateringRecommendation[]> {
  return request<WateringRecommendation[]>(
    `/api/plants/${id}/recommendations`,
  );
}

/* ================================================================
   Templates
   ================================================================ */

export function fetchTemplates(category?: string): Promise<PlantTemplate[]> {
  const params = category ? `?category=${encodeURIComponent(category)}` : '';
  return request<PlantTemplate[]>(`/api/templates${params}`);
}

/* ================================================================
   Sensors
   ================================================================ */

export function fetchSensors(): Promise<Sensor[]> {
  return request<Sensor[]>('/api/sensors');
}

export function updateSensor(
  id: string,
  data: Partial<Omit<Sensor, 'id' | 'createdAt'>>,
): Promise<Sensor> {
  return request<Sensor>(`/api/sensors/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

/* ================================================================
   Recommendations
   ================================================================ */

export function fetchRecommendations(
  status?: 'pending' | 'acknowledged' | 'watered' | 'expired',
): Promise<WateringRecommendation[]> {
  const params = status ? `?status=${encodeURIComponent(status)}` : '';
  return request<WateringRecommendation[]>(`/api/recommendations${params}`);
}

export function acknowledgeRecommendation(id: string): Promise<void> {
  return request<void>(`/api/recommendations/${id}/acknowledge`, {
    method: 'POST',
  });
}

export function markWatered(
  id: string,
  data?: { amountMl?: number; wateredBy?: string },
): Promise<void> {
  return request<void>(`/api/recommendations/${id}/watered`, {
    method: 'POST',
    body: JSON.stringify(data ?? {}),
  });
}

/* ================================================================
   Weather
   ================================================================ */

export function fetchWeather(): Promise<{
  tempCurrent?: number;
  description: string;
  et0Today: number;
  rainToday: number;
}> {
  return request('/api/weather');
}

/* ================================================================
   Uploads
   ================================================================ */

export async function uploadImage(file: File): Promise<{ url: string }> {
  const formData = new FormData();
  formData.append('image', file);

  const res = await fetch('/api/uploads/image', {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    throw new ApiError(res.status, res.statusText, await res.text());
  }

  return res.json() as Promise<{ url: string }>;
}

/* ================================================================
   Push subscriptions
   ================================================================ */

export function subscribePush(data: {
  deviceLabel: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  preferences: {
    wateringNeeded: boolean;
    criticalAlerts: boolean;
    dailyStatus: boolean;
    sensorOffline: boolean;
    lowBattery: boolean;
  };
}): Promise<PushSubscription> {
  return request<PushSubscription>('/api/push/subscriptions', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function unsubscribePush(id: string): Promise<void> {
  return request<void>(`/api/push/subscriptions/${id}`, {
    method: 'DELETE',
  });
}

export function testPush(id: string): Promise<void> {
  return request<void>(`/api/push/subscriptions/${id}/test`, {
    method: 'POST',
  });
}

export function getVapidPublicKey(): Promise<string> {
  return request<{ publicKey: string }>('/api/push/vapid-public-key').then(
    (r) => r.publicKey,
  );
}
