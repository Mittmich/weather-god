const WEATHER_API = "https://api.open-meteo.com/v1/forecast";
const GEOCODE_API = "https://geocoding-api.open-meteo.com/v1/search";

const form = document.getElementById("weather-form");
const statusNode = document.getElementById("status");
const results = document.getElementById("results");

function setStatus(message, isError = false) {
  statusNode.textContent = message;
  statusNode.style.color = isError ? "#fda4af" : "#38bdf8";
}

function toTime(value) {
  const date = new Date(value);
  return new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit" }).format(date);
}

function toHours(seconds) {
  return `${(seconds / 3600).toFixed(2)} h`;
}

async function resolveLocation(query, fallbackValue) {
  const trimmed = query.trim();
  if (!trimmed) {
    const [lat, lon, name] = fallbackValue.split(",");
    return { latitude: Number(lat), longitude: Number(lon), name };
  }

  const url = `${GEOCODE_API}?name=${encodeURIComponent(trimmed)}&count=1&language=en&format=json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to find location");
  const payload = await response.json();
  const first = payload?.results?.[0];
  if (!first) throw new Error("No matching location found");

  return {
    latitude: first.latitude,
    longitude: first.longitude,
    name: `${first.name}${first.country ? `, ${first.country}` : ""}`,
  };
}

async function loadWeather(event) {
  event.preventDefault();
  setStatus("Loading weather...");
  results.hidden = true;

  const data = new FormData(form);
  const selected = data.get("location");
  const query = data.get("location-query") || "";
  const altitude = Number(data.get("altitude"));

  try {
    const location = await resolveLocation(query, selected);

    const params = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      current: "temperature_2m,apparent_temperature,precipitation,wind_speed_10m,wind_direction_10m",
      daily: "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max,sunrise,sunset,daylight_duration",
      timezone: "auto",
      forecast_days: "1",
    });

    if (Number.isFinite(altitude)) {
      params.set("elevation", String(altitude));
    }

    const response = await fetch(`${WEATHER_API}?${params.toString()}`);
    if (!response.ok) throw new Error("Weather service is unavailable");
    const weather = await response.json();

    const current = weather.current;
    const daily = weather.daily;

    document.getElementById("result-location").textContent = `${location.name} (${location.latitude.toFixed(2)}, ${location.longitude.toFixed(2)}) @ ${altitude} m`;

    document.getElementById("temp-current").textContent = `${current.temperature_2m} °C`;
    document.getElementById("temp-apparent").textContent = `${current.apparent_temperature} °C`;
    document.getElementById("temp-range").textContent = `${daily.temperature_2m_min[0]} to ${daily.temperature_2m_max[0]} °C`;

    document.getElementById("precip-current").textContent = `${current.precipitation} mm`;
    document.getElementById("precip-total").textContent = `${daily.precipitation_sum[0]} mm`;
    document.getElementById("precip-prob").textContent = `${daily.precipitation_probability_max[0]} %`;

    document.getElementById("wind-speed").textContent = `${current.wind_speed_10m} km/h`;
    document.getElementById("wind-direction").textContent = `${current.wind_direction_10m}°`;
    document.getElementById("wind-gust").textContent = `${daily.wind_gusts_10m_max[0]} km/h`;

    document.getElementById("sunrise").textContent = toTime(daily.sunrise[0]);
    document.getElementById("sunset").textContent = toTime(daily.sunset[0]);
    document.getElementById("sun-hours").textContent = toHours(daily.daylight_duration[0]);

    const tempSpread = (daily.temperature_2m_max[0] - daily.temperature_2m_min[0]).toFixed(1);
    const windSpread = (daily.wind_gusts_10m_max[0] - current.wind_speed_10m).toFixed(1);
    document.getElementById("uncertainty-temp").textContent = `${tempSpread} °C spread`;
    document.getElementById("uncertainty-precip").textContent = `${daily.precipitation_probability_max[0]}% chance of measurable precipitation`;
    document.getElementById("uncertainty-wind").textContent = `${windSpread} km/h possible change to gust peak`;

    setStatus("Weather loaded.");
    results.hidden = false;
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Unexpected weather loading error", true);
  }
}

form.addEventListener("submit", loadWeather);
form.requestSubmit();
