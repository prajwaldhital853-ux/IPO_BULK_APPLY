/** Open-Meteo forecast (no API key). https://open-meteo.com */

export type WeatherCity = {
  id: string;
  name: string;
  region: string;
  lat: number;
  lon: number;
};

export const NEPAL_CITIES: WeatherCity[] = [
  { id: 'kathmandu', name: 'Kathmandu', region: 'Bagmati', lat: 27.7172, lon: 85.324 },
  { id: 'lalitpur', name: 'Lalitpur', region: 'Bagmati', lat: 27.6667, lon: 85.3333 },
  { id: 'bhaktapur', name: 'Bhaktapur', region: 'Bagmati', lat: 27.671, lon: 85.4298 },
  { id: 'pokhara', name: 'Pokhara', region: 'Gandaki', lat: 28.2096, lon: 83.9856 },
  { id: 'bharatpur', name: 'Bharatpur', region: 'Chitwan', lat: 27.6833, lon: 84.4333 },
  { id: 'biratnagar', name: 'Biratnagar', region: 'Koshi', lat: 26.4525, lon: 87.2718 },
  { id: 'birgunj', name: 'Birgunj', region: 'Madhesh', lat: 27.0104, lon: 84.877 },
  { id: 'dharan', name: 'Dharan', region: 'Koshi', lat: 26.8129, lon: 87.2832 },
  { id: 'butwal', name: 'Butwal', region: 'Lumbini', lat: 27.7006, lon: 83.4484 },
  { id: 'nepalgunj', name: 'Nepalgunj', region: 'Lumbini', lat: 28.05, lon: 81.6167 },
  { id: 'hetauda', name: 'Hetauda', region: 'Bagmati', lat: 27.4284, lon: 85.0322 },
  { id: 'janakpur', name: 'Janakpur', region: 'Madhesh', lat: 26.7288, lon: 85.9263 },
  { id: 'damak', name: 'Damak', region: 'Koshi', lat: 26.66, lon: 87.7 },
  { id: 'itahari', name: 'Itahari', region: 'Koshi', lat: 26.6667, lon: 87.2833 },
];

export type WeatherCondition = {
  code: number;
  label: string;
  /** Ionicons name */
  icon: string;
  /** Daytime sky tint for hero */
  sky: string;
};

export type HourlyPoint = {
  time: string;
  hourLabel: string;
  temp: number;
  code: number;
  precipProb: number | null;
  isNow: boolean;
};

export type DailyPoint = {
  date: string;
  dayLabel: string;
  code: number;
  tempMax: number;
  tempMin: number;
  precipSum: number;
  uvMax: number | null;
};

export type WeatherBundle = {
  city: WeatherCity;
  updatedAt: string;
  current: {
    temp: number;
    feelsLike: number;
    humidity: number;
    precip: number;
    windSpeed: number;
    windDir: number;
    isDay: boolean;
    code: number;
  };
  daily: DailyPoint[];
  hourly: HourlyPoint[];
  sun: {
    sunrise: string | null;
    sunset: string | null;
  };
  uvMax: number | null;
};

function wmoCondition(code: number, isDay: boolean): WeatherCondition {
  const night = !isDay;
  if (code === 0) {
    return {
      code,
      label: night ? 'Clear night' : 'Clear sky',
      icon: night ? 'moon' : 'sunny',
      sky: night ? '#1A237E' : '#29B6F6',
    };
  }
  if (code === 1) {
    return {
      code,
      label: 'Mainly clear',
      icon: night ? 'cloudy-night' : 'partly-sunny',
      sky: night ? '#283593' : '#42A5F5',
    };
  }
  if (code === 2) {
    return {
      code,
      label: 'Partly cloudy',
      icon: night ? 'cloudy-night' : 'partly-sunny',
      sky: night ? '#37474F' : '#5C9EAD',
    };
  }
  if (code === 3) {
    return {
      code,
      label: 'Overcast',
      icon: 'cloudy',
      sky: '#607D8B',
    };
  }
  if (code === 45 || code === 48) {
    return { code, label: 'Fog', icon: 'cloud', sky: '#78909C' };
  }
  if (code >= 51 && code <= 57) {
    return { code, label: 'Drizzle', icon: 'rainy', sky: '#546E7A' };
  }
  if (code >= 61 && code <= 67) {
    return { code, label: 'Rain', icon: 'rainy', sky: '#455A64' };
  }
  if (code >= 71 && code <= 77) {
    return { code, label: 'Snow', icon: 'snow', sky: '#90A4AE' };
  }
  if (code >= 80 && code <= 82) {
    return { code, label: 'Showers', icon: 'rainy', sky: '#546E7A' };
  }
  if (code >= 85 && code <= 86) {
    return { code, label: 'Snow showers', icon: 'snow', sky: '#78909C' };
  }
  if (code >= 95) {
    return { code, label: 'Thunderstorm', icon: 'thunderstorm', sky: '#37474F' };
  }
  return { code, label: 'Weather', icon: 'partly-sunny', sky: '#29B6F6' };
}

export function describeWeather(code: number, isDay = true): WeatherCondition {
  return wmoCondition(code, isDay);
}

function pad2(n: number): string {
  return `${n}`.padStart(2, '0');
}

function formatHourLabel(isoLocal: string): string {
  // "2026-08-07T14:00"
  const t = isoLocal.slice(11, 16);
  const h = Number(t.slice(0, 2));
  if (!Number.isFinite(h)) return t;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}${ampm}`;
}

function formatDayLabel(isoDate: string, index: number): string {
  if (index === 0) return 'Today';
  if (index === 1) return 'Tomorrow';
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

function formatClock(isoLocal: string | null | undefined): string | null {
  if (!isoLocal) return null;
  const t = isoLocal.slice(11, 16);
  if (!/^\d{2}:\d{2}$/.test(t)) return null;
  const h = Number(t.slice(0, 2));
  const m = t.slice(3);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

type OpenMeteoResponse = {
  current?: {
    time?: string;
    temperature_2m?: number;
    relative_humidity_2m?: number;
    apparent_temperature?: number;
    is_day?: number;
    precipitation?: number;
    weather_code?: number;
    wind_speed_10m?: number;
    wind_direction_10m?: number;
  };
  hourly?: {
    time?: string[];
    temperature_2m?: (number | null)[];
    weather_code?: (number | null)[];
    precipitation_probability?: (number | null)[];
  };
  daily?: {
    time?: string[];
    weather_code?: (number | null)[];
    temperature_2m_max?: (number | null)[];
    temperature_2m_min?: (number | null)[];
    sunrise?: string[];
    sunset?: string[];
    uv_index_max?: (number | null)[];
    precipitation_sum?: (number | null)[];
  };
};

export async function fetchWeatherForCity(
  city: WeatherCity,
  signal?: AbortSignal,
): Promise<WeatherBundle> {
  const params = new URLSearchParams({
    latitude: String(city.lat),
    longitude: String(city.lon),
    timezone: 'Asia/Kathmandu',
    forecast_days: '7',
    current: [
      'temperature_2m',
      'relative_humidity_2m',
      'apparent_temperature',
      'is_day',
      'precipitation',
      'weather_code',
      'wind_speed_10m',
      'wind_direction_10m',
    ].join(','),
    hourly: [
      'temperature_2m',
      'weather_code',
      'precipitation_probability',
    ].join(','),
    daily: [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'sunrise',
      'sunset',
      'uv_index_max',
      'precipitation_sum',
    ].join(','),
  });

  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Weather request failed (${res.status})`);
  }
  const data = (await res.json()) as OpenMeteoResponse;
  const cur = data.current;
  if (!cur || cur.temperature_2m == null || cur.weather_code == null) {
    throw new Error('Weather data incomplete');
  }

  const isDay = cur.is_day === 1;
  const now = new Date();
  const nowHourKey = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}T${pad2(now.getHours())}`;

  const hourlyTimes = data.hourly?.time ?? [];
  const startIdx = Math.max(
    0,
    hourlyTimes.findIndex((t) => t.startsWith(nowHourKey.slice(0, 13))),
  );
  const hourly: HourlyPoint[] = [];
  for (let i = startIdx; i < hourlyTimes.length && hourly.length < 24; i += 1) {
    const time = hourlyTimes[i]!;
    const temp = data.hourly?.temperature_2m?.[i];
    const code = data.hourly?.weather_code?.[i];
    if (temp == null || code == null) continue;
    hourly.push({
      time,
      hourLabel: hourly.length === 0 ? 'Now' : formatHourLabel(time),
      temp: Math.round(temp),
      code,
      precipProb: data.hourly?.precipitation_probability?.[i] ?? null,
      isNow: hourly.length === 0,
    });
  }

  const dailyTimes = data.daily?.time ?? [];
  const daily: DailyPoint[] = dailyTimes.map((date, i) => ({
    date,
    dayLabel: formatDayLabel(date, i),
    code: data.daily?.weather_code?.[i] ?? 0,
    tempMax: Math.round(data.daily?.temperature_2m_max?.[i] ?? 0),
    tempMin: Math.round(data.daily?.temperature_2m_min?.[i] ?? 0),
    precipSum: data.daily?.precipitation_sum?.[i] ?? 0,
    uvMax: data.daily?.uv_index_max?.[i] ?? null,
  }));

  return {
    city,
    updatedAt: cur.time ?? new Date().toISOString(),
    current: {
      temp: Math.round(cur.temperature_2m),
      feelsLike: Math.round(cur.apparent_temperature ?? cur.temperature_2m),
      humidity: Math.round(cur.relative_humidity_2m ?? 0),
      precip: cur.precipitation ?? 0,
      windSpeed: Math.round(cur.wind_speed_10m ?? 0),
      windDir: Math.round(cur.wind_direction_10m ?? 0),
      isDay,
      code: cur.weather_code,
    },
    daily,
    hourly,
    sun: {
      sunrise: formatClock(data.daily?.sunrise?.[0]),
      sunset: formatClock(data.daily?.sunset?.[0]),
    },
    uvMax: data.daily?.uv_index_max?.[0] ?? null,
  };
}

export function windDirectionLabel(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const i = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return dirs[i]!;
}
