// Precipitation probability colour thresholds for the 7-day forecast
const PRECIP_PROB_HIGH = 70;
const PRECIP_PROB_MEDIUM = 40;
const PRECIP_COLOR_HIGH = "#38bdf8";
const PRECIP_COLOR_MEDIUM = "#7dd3fc";
const PRECIP_COLOR_LOW = "#64748b";

const WEATHER_API = "https://api.open-meteo.com/v1/forecast";
const GEOCODE_API = "https://geocoding-api.open-meteo.com/v1/search";

const form = document.getElementById("weather-form");
const statusNode = document.getElementById("status");
const results = document.getElementById("results");
const locationQueryInput = document.getElementById("location-query");
const autocompleteList = document.getElementById("autocomplete-list");

let selectedLocation = null;
let debounceTimer = null;

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

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

function formatDate(isoDateStr, short = false) {
  // Use noon UTC to avoid day-boundary shifts across all timezones
  const date = new Date(isoDateStr + "T12:00:00Z");
  return new Intl.DateTimeFormat([], short
    ? { weekday: "short", day: "numeric" }
    : { weekday: "short", month: "short", day: "numeric" }
  ).format(date);
}

// ---------------------------------------------------------------------------
// Location autocomplete
// ---------------------------------------------------------------------------

async function fetchSuggestions(query) {
  if (query.trim().length < 2) return [];
  const url = `${GEOCODE_API}?name=${encodeURIComponent(query.trim())}&count=5&language=en&format=json`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return data?.results ?? [];
  } catch {
    return [];
  }
}

function renderAutocomplete(items) {
  autocompleteList.innerHTML = "";
  if (!items.length) { autocompleteList.hidden = true; return; }
  items.forEach((item) => {
    const li = document.createElement("li");
    const parts = [item.name, item.admin1, item.country].filter(Boolean);
    const sub = parts.slice(1).join(", ");
    li.innerHTML = `<span class="ac-main">${parts[0]}</span>${sub ? `<span class="ac-sub"> — ${sub}</span>` : ""}`;
    li.addEventListener("click", () => {
      selectedLocation = { latitude: item.latitude, longitude: item.longitude, name: parts.join(", ") };
      locationQueryInput.value = parts.join(", ");
      autocompleteList.hidden = true;
    });
    autocompleteList.appendChild(li);
  });
  autocompleteList.hidden = false;
}

locationQueryInput.addEventListener("input", () => {
  selectedLocation = null;
  clearTimeout(debounceTimer);
  if (!locationQueryInput.value.trim()) { autocompleteList.hidden = true; return; }
  debounceTimer = setTimeout(async () => renderAutocomplete(await fetchSuggestions(locationQueryInput.value)), 300);
});

document.addEventListener("click", (e) => {
  if (!autocompleteList.contains(e.target) && e.target !== locationQueryInput) {
    autocompleteList.hidden = true;
  }
});

locationQueryInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { autocompleteList.hidden = true; return; }
  if (e.key === "ArrowDown") autocompleteList.querySelector("li")?.focus();
});

async function resolveLocation(query, fallbackValue) {
  if (selectedLocation) return selectedLocation;
  const trimmed = query.trim();
  if (!trimmed) {
    const parts = fallbackValue.split(",");
    return { latitude: Number(parts[0]), longitude: Number(parts[1]), name: parts.slice(2).join(",") };
  }
  const items = await fetchSuggestions(trimmed);
  if (!items.length) throw new Error("No matching location found");
  const first = items[0];
  const parts = [first.name, first.admin1, first.country].filter(Boolean);
  return { latitude: first.latitude, longitude: first.longitude, name: parts.join(", ") };
}

// ---------------------------------------------------------------------------
// SVG chart builder
// ---------------------------------------------------------------------------

function makeSVGChart({ labels, mainSeries, bandSeries, barSeries, unit, title, zeroBaseline = false }) {
  const W = 600, H = 140;
  const pl = 46, pr = 12, pt = 20, pb = 28;
  const chartW = W - pl - pr;
  const chartH = H - pt - pb;
  const n = labels.length;

  const allVals = [
    ...(mainSeries?.values ?? []),
    ...(bandSeries?.low ?? []),
    ...(bandSeries?.high ?? []),
    ...(barSeries?.values ?? []),
  ].filter(Number.isFinite);

  if (!allVals.length) return document.createElement("div");

  let minV = zeroBaseline ? 0 : Math.min(...allVals);
  let maxV = Math.max(...allVals);
  if (minV === maxV) maxV = minV + 1;
  const range = maxV - minV;

  const xScale = (i) => pl + (i / Math.max(n - 1, 1)) * chartW;
  const yScale = (v) => pt + chartH - ((v - minV) / range) * chartH;
  const yBottom = pt + chartH; // = yScale(minV) always

  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", "chart-svg");

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    if (parent) parent.appendChild(e);
    return e;
  }

  // Y-axis grid lines and labels
  const steps = 4;
  for (let s = 0; s <= steps; s++) {
    const v = minV + (range * s) / steps;
    const y = yScale(v);
    el("line", { x1: pl, x2: pl + chartW, y1: y, y2: y, stroke: "#1e293b", "stroke-width": 1 }, svg);
    const label = v.toFixed(Math.abs(v) < 10 && range < 20 ? 1 : 0) + (unit ? ` ${unit}` : "");
    el("text", { x: pl - 4, y: y + 4, fill: "#64748b", "font-size": 9, "text-anchor": "end" }, svg).textContent = label;
  }

  // X-axis labels (show ~8 evenly spaced)
  const labelStep = Math.max(1, Math.ceil(n / 8));
  labels.forEach((label, i) => {
    if (i % labelStep !== 0 && i !== n - 1) return;
    el("text", { x: xScale(i), y: H - pb + 14, fill: "#64748b", "font-size": 9, "text-anchor": "middle" }, svg)
      .textContent = label;
  });

  // Confidence band (shaded area between low and high)
  if (bandSeries?.low?.length && bandSeries?.high?.length) {
    const upper = bandSeries.high.map((v, i) => `${i === 0 ? "M" : "L"}${xScale(i).toFixed(1)},${yScale(v).toFixed(1)}`).join(" ");
    const lower = [...bandSeries.low].reverse().map((v, i) => `L${xScale(n - 1 - i).toFixed(1)},${yScale(v).toFixed(1)}`).join(" ");
    el("path", { d: `${upper} ${lower} Z`, fill: bandSeries.color ?? "#38bdf8", "fill-opacity": 0.2, stroke: "none" }, svg);
  }

  // Bar series (e.g. precipitation)
  if (barSeries?.values?.length) {
    const barW = Math.max(2, (chartW / n) * 0.65);
    barSeries.values.forEach((v, i) => {
      if (!v) return;
      const prob = barSeries.probabilities?.[i] ?? 100;
      const yTop = yScale(v);
      const bH = Math.max(1, yBottom - yTop);
      el("rect", {
        x: (xScale(i) - barW / 2).toFixed(1), y: yTop.toFixed(1),
        width: barW.toFixed(1), height: bH.toFixed(1),
        fill: barSeries.color ?? "#38bdf8",
        "fill-opacity": (0.25 + 0.75 * (prob / 100)).toFixed(2),
        rx: 2,
      }, svg);
    });
  }

  // Main line
  if (mainSeries?.values?.length) {
    const d = mainSeries.values
      .map((v, i) => `${i === 0 ? "M" : "L"}${xScale(i).toFixed(1)},${yScale(v).toFixed(1)}`)
      .join(" ");
    el("path", {
      d, stroke: mainSeries.color ?? "#38bdf8", "stroke-width": 2,
      fill: "none", "stroke-linejoin": "round", "stroke-linecap": "round",
    }, svg);
  }

  // Chart title
  if (title) {
    el("text", { x: pl, y: 13, fill: "#94a3b8", "font-size": 10, "font-weight": "600" }, svg).textContent = title;
  }

  return svg;
}

// ---------------------------------------------------------------------------
// Hourly charts
// ---------------------------------------------------------------------------

function renderHourlyCharts(hourly, dateStr) {
  const indices = [];
  hourly.time.forEach((t, i) => { if (t.startsWith(dateStr)) indices.push(i); });
  if (!indices.length) return;

  const get = (key) => {
    const arr = hourly[key];
    return indices.map((i) => (arr != null ? arr[i] : null));
  };
  const hours = get("time").map((t) => t.slice(11, 16));
  const temp = get("temperature_2m");
  const apparent = get("apparent_temperature");
  const precip = get("precipitation");
  const precipProb = get("precipitation_probability");
  const wind = get("wind_speed_10m");
  const gusts = get("wind_gusts_10m");

  const container = document.getElementById("hourly-charts");
  container.innerHTML = "";

  function addChart(svg) {
    const div = document.createElement("div");
    div.className = "chart-card";
    div.appendChild(svg);
    container.appendChild(div);
  }

  addChart(makeSVGChart({
    labels: hours,
    mainSeries: { values: temp, color: "#fb923c" },
    bandSeries: {
      low: temp.map((t, i) => Math.min(t, apparent[i])),
      high: temp.map((t, i) => Math.max(t, apparent[i])),
      color: "#fb923c",
    },
    unit: "°C",
    title: "Temperature °C  (shaded band = actual vs. apparent temperature range)",
  }));

  addChart(makeSVGChart({
    labels: hours,
    barSeries: { values: precip, probabilities: precipProb, color: "#38bdf8" },
    unit: "mm",
    title: "Precipitation mm  (bar opacity = forecast probability %)",
    zeroBaseline: true,
  }));

  addChart(makeSVGChart({
    labels: hours,
    mainSeries: { values: wind, color: "#a78bfa" },
    bandSeries: { low: wind, high: gusts, color: "#a78bfa" },
    unit: "km/h",
    title: "Wind km/h  (shaded band = gust confidence interval)",
  }));
}

// ---------------------------------------------------------------------------
// Day selector for hourly view
// ---------------------------------------------------------------------------

function buildDaySelector(daily, hourly) {
  const container = document.getElementById("day-selector");
  container.innerHTML = "";
  daily.time.forEach((dateStr, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "day-btn" + (idx === 0 ? " active" : "");
    btn.textContent = formatDate(dateStr, true);
    btn.addEventListener("click", () => {
      container.querySelectorAll(".day-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderHourlyCharts(hourly, dateStr);
    });
    container.appendChild(btn);
  });
}

// ---------------------------------------------------------------------------
// 7-day forecast
// ---------------------------------------------------------------------------

function renderForecast(daily) {
  const container = document.getElementById("forecast-days");
  container.innerHTML = "";

  const tMins = daily.temperature_2m_min;
  const tMaxs = daily.temperature_2m_max;
  const validMins = tMins.filter((v) => v != null);
  const validMaxs = tMaxs.filter((v) => v != null);
  const absMin = validMins.length ? Math.min(...validMins) : 0;
  const absMax = validMaxs.length ? Math.max(...validMaxs) : 1;
  const absRange = absMax - absMin || 1;

  daily.time.forEach((dateStr, i) => {
    const tmin = tMins[i];
    const tmax = tMaxs[i];
    const precip = daily.precipitation_sum[i];
    const precipProb = daily.precipitation_probability_max?.[i] ?? null;
    const windMax = daily.wind_speed_10m_max[i];
    const gustMax = daily.wind_gusts_10m_max[i];
    const sunrise = toTime(daily.sunrise[i]);
    const sunset = toTime(daily.sunset[i]);

    const barLeft = (tmin != null ? (tmin - absMin) / absRange * 100 : 0).toFixed(1);
    const barWidth = (tmin != null && tmax != null ? (tmax - tmin) / absRange * 100 : 0).toFixed(1);
    const precipProbDisplay = precipProb != null ? `${precipProb}%` : "N/A";
    const probColor = precipProb >= PRECIP_PROB_HIGH ? PRECIP_COLOR_HIGH : precipProb >= PRECIP_PROB_MEDIUM ? PRECIP_COLOR_MEDIUM : PRECIP_COLOR_LOW;

    const card = document.createElement("article");
    card.className = "forecast-card";
    card.innerHTML = `
      <div class="fc-date">${formatDate(dateStr)}</div>
      <div class="fc-temp">
        <span class="fc-tmin">${tmin != null ? tmin.toFixed(1) : "—"}°</span>
        <div class="fc-bar-track" title="Daily temperature range: ${tmin != null ? tmin.toFixed(1) : "—"}° – ${tmax != null ? tmax.toFixed(1) : "—"}°C">
          <div class="fc-bar" style="left:${barLeft}%;width:${barWidth}%"></div>
        </div>
        <span class="fc-tmax">${tmax != null ? tmax.toFixed(1) : "—"}°</span>
      </div>
      <div class="fc-details">
        <span class="fc-precip" style="color:${probColor}">🌧 ${precip != null ? precip.toFixed(1) : "N/A"} mm <span class="fc-ci">${precipProbDisplay}</span></span>
        <span class="fc-wind">💨 ${windMax != null ? windMax.toFixed(0) : "N/A"}–${gustMax != null ? gustMax.toFixed(0) : "N/A"} km/h</span>
        <span class="fc-sun">🌅 ${sunrise}–${sunset}</span>
      </div>
    `;
    container.appendChild(card);
  });
}

// ---------------------------------------------------------------------------
// Main load handler
// ---------------------------------------------------------------------------

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
      hourly: "temperature_2m,apparent_temperature,precipitation,precipitation_probability,wind_speed_10m,wind_direction_10m,wind_gusts_10m",
      daily: "temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,sunrise,sunset,daylight_duration",
      timezone: "auto",
      forecast_days: "7",
    });

    if (Number.isFinite(altitude)) {
      params.set("elevation", String(altitude));
    }

    const response = await fetch(`${WEATHER_API}?${params.toString()}`);
    if (!response.ok) throw new Error("Weather service is unavailable");
    const weather = await response.json();

    const current = weather.current;
    const daily = weather.daily;
    const hourly = weather.hourly;

    document.getElementById("result-location").textContent =
      `${location.name} (${location.latitude.toFixed(2)}, ${location.longitude.toFixed(2)}) @ ${altitude} m`;

    document.getElementById("temp-current").textContent = `${current.temperature_2m} °C`;
    document.getElementById("temp-apparent").textContent = `${current.apparent_temperature} °C`;
    document.getElementById("temp-range").textContent = `${daily.temperature_2m_min[0]} to ${daily.temperature_2m_max[0]} °C`;

    document.getElementById("precip-current").textContent = `${current.precipitation} mm`;
    document.getElementById("precip-total").textContent = `${daily.precipitation_sum[0]} mm`;
    document.getElementById("precip-prob").textContent = `${daily.precipitation_probability_max?.[0] ?? "N/A"} %`;

    document.getElementById("wind-speed").textContent = `${current.wind_speed_10m} km/h`;
    document.getElementById("wind-direction").textContent = `${current.wind_direction_10m}°`;
    document.getElementById("wind-gust").textContent = `${daily.wind_gusts_10m_max[0]} km/h`;

    document.getElementById("sunrise").textContent = toTime(daily.sunrise[0]);
    document.getElementById("sunset").textContent = toTime(daily.sunset[0]);
    document.getElementById("sun-hours").textContent = toHours(daily.daylight_duration[0]);

    const tempSpread = (daily.temperature_2m_max[0] - daily.temperature_2m_min[0]).toFixed(1);
    const windSpread = (daily.wind_gusts_10m_max[0] - current.wind_speed_10m).toFixed(1);
    document.getElementById("uncertainty-temp").textContent = `${tempSpread} °C spread`;
    document.getElementById("uncertainty-precip").textContent =
      `${daily.precipitation_probability_max?.[0] ?? "N/A"}% chance of measurable precipitation`;
    document.getElementById("uncertainty-wind").textContent = `${windSpread} km/h possible change to gust peak`;

    setStatus("Weather loaded.");
    results.hidden = false;

    buildDaySelector(daily, hourly);
    renderHourlyCharts(hourly, daily.time[0]);
    renderForecast(daily);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Unexpected weather loading error", true);
  }
}

form.addEventListener("submit", loadWeather);
