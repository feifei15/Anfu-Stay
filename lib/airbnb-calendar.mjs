const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

const caches = new Map();

function unfoldIcs(value) {
  return String(value).replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}

function dateValue(line) {
  const value = line?.slice(line.indexOf(":") + 1).trim();
  const match = /^(\d{4})(\d{2})(\d{2})/.exec(value || "");
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function addDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function parseAirbnbCalendar(ics) {
  const blocked = new Set();
  const events = unfoldIcs(ics).split("BEGIN:VEVENT").slice(1);

  for (const event of events) {
    const body = event.split("END:VEVENT", 1)[0];
    const lines = body.split("\n");
    if (lines.some((line) => line.trim().toUpperCase() === "STATUS:CANCELLED")) continue;

    const start = dateValue(lines.find((line) => /^DTSTART(?:;[^:]*)?:/i.test(line)));
    const end = dateValue(lines.find((line) => /^DTEND(?:;[^:]*)?:/i.test(line)));
    if (!start || !end || end <= start) continue;

    for (let day = start; day < end; day = addDays(day, 1)) blocked.add(day);
  }

  return [...blocked].sort();
}

async function loadCalendar(environmentName) {
  const url = process.env[environmentName];
  if (!url) return [];

  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== "www.airbnb.com") {
    throw new Error(`${environmentName} must be an Airbnb HTTPS calendar URL.`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: "text/calendar" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Airbnb calendar returned ${response.status}.`);
    return parseAirbnbCalendar(await response.text());
  } finally {
    clearTimeout(timer);
  }
}

export async function getHongKongAirbnbBlockedDates({ start, end } = {}) {
  return getAirbnbBlockedDates("AIRBNB_HK_ICAL_URL", { start, end });
}

export async function getLasVegasAirbnbBlockedDates({ start, end } = {}) {
  return getAirbnbBlockedDates("AIRBNB_LV_ICAL_URL", { start, end });
}

async function getAirbnbBlockedDates(environmentName, { start, end } = {}) {
  const now = Date.now();
  let cached = caches.get(environmentName);
  if (!cached || cached.expiresAt <= now) {
    cached = { dates: await loadCalendar(environmentName), expiresAt: now + CACHE_TTL_MS };
    caches.set(environmentName, cached);
  }
  return cached.dates.filter((date) => (!start || date >= start) && (!end || date < end));
}

export function clearAirbnbCalendarCache() {
  caches.clear();
}
