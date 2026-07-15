const config = require('../config');

const WEATHERAPI_BASE = 'https://api.weatherapi.com/v1';

// Short-lived cache so repeated dashboard loads don't burn the quota.
const TTL_MS = 10 * 60 * 1000; // 10 minutes
const cache = new Map();

/**
 * Fetch current weather + 3-day forecast from WeatherAPI.com.
 * @param {string} q - city name or "lat,lon"
 */
async function getWeather(q) {
  if (!config.weather.apiKey) {
    const err = new Error('WEATHER_API_KEY is not configured');
    err.status = 500;
    throw err;
  }

  const query = (q || config.weather.defaultLocation || 'Bangalore').trim();

  const hit = cache.get(query);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const url = new URL(`${WEATHERAPI_BASE}/forecast.json`);
  url.searchParams.set('key', config.weather.apiKey);
  url.searchParams.set('q', query);
  url.searchParams.set('days', '4');
  url.searchParams.set('aqi', 'no');
  url.searchParams.set('alerts', 'no');

  let res;
  try {
    res = await fetch(url);
  } catch {
    const err = new Error('Could not reach the weather service.');
    err.status = 502;
    throw err;
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = data.error?.message || `Weather error (${res.status})`;
    const err = new Error(msg);
    err.status = res.status === 400 || res.status === 401 || res.status === 403 ? 400 : 502;
    throw err;
  }

  const cur = data.current || {};
  const loc = data.location || {};
  const value = {
    location: {
      name: loc.name,
      region: loc.region,
      country: loc.country,
      localtime: loc.localtime,
    },
    current: {
      tempC: cur.temp_c,
      feelsLikeC: cur.feelslike_c,
      humidity: cur.humidity,
      windKph: cur.wind_kph,
      condition: cur.condition?.text || '',
      icon: cur.condition?.icon ? `https:${cur.condition.icon}` : null,
      isDay: cur.is_day === 1,
    },
    forecast: (data.forecast?.forecastday || []).slice(1, 4).map((f) => ({
      date: f.date,
      maxC: f.day?.maxtemp_c,
      minC: f.day?.mintemp_c,
      condition: f.day?.condition?.text || '',
      icon: f.day?.condition?.icon ? `https:${f.day.condition.icon}` : null,
    })),
  };

  cache.set(query, { at: Date.now(), value });
  return value;
}

module.exports = { getWeather };
