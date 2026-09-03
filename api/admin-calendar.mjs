import crypto from "node:crypto";
import { getAdminCalendar, updateAdminCalendar } from "../lib/booking-db.mjs";
import { getHongKongAdminCalendar, importHongKongPriceLabsPrices, updateHongKongAdminCalendar } from "../lib/booking-db-hk.mjs";
import { getHongKongPriceLabsPrices } from "../lib/pricelabs.mjs";
import { getLasVegasAdminCalendar, importLasVegasPriceLabsPrices, updateLasVegasAdminCalendar } from "../lib/booking-db-lv.mjs";
import { getLasVegasPriceLabsPrices } from "../lib/pricelabs.mjs";
import { getInquiries } from "../lib/contact-inquiries.mjs";

function sendJson(response, status, body) {
  response.status(status).setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

function safeEqual(left, right) {
  const a = crypto.createHash("sha256").update(String(left)).digest();
  const b = crypto.createHash("sha256").update(String(right)).digest();
  return crypto.timingSafeEqual(a, b);
}

function authorized(request) {
  if (!process.env.ADMIN_PASSWORD) return false;
  const encoded = String(request.headers.authorization || "").match(/^Basic (.+)$/i)?.[1];
  if (!encoded) return false;
  let credentials;
  try { credentials = Buffer.from(encoded, "base64").toString("utf8"); } catch { return false; }
  const separator = credentials.indexOf(":");
  const username = separator >= 0 ? credentials.slice(0, separator) : "";
  const password = separator >= 0 ? credentials.slice(separator + 1) : "";
  return safeEqual(username, process.env.ADMIN_USERNAME || "admin") && safeEqual(password, process.env.ADMIN_PASSWORD);
}

function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value || ""); }
function validLocation(value) { return value === "sh" || value === "hk" || value === "lv"; }

export default async function adminCalendar(request, response) {
  if (!authorized(request)) {
    return sendJson(response, 401, { error: "Authentication required." });
  }
  try {
    if (request.method === "GET") {
      const start = String(request.query?.start || "");
      const end = String(request.query?.end || "");
      const location = String(request.query?.location || "sh");
      if (!validDate(start) || !validDate(end)) return sendJson(response, 400, { error: "Invalid date range." });
      if (!validLocation(location)) return sendJson(response, 400, { error: "Invalid location." });
      const [calendar, inquiries] = await Promise.all([
        location === "hk" ? getHongKongAdminCalendar(start, end)
          : location === "lv" ? getLasVegasAdminCalendar(start, end) : getAdminCalendar(start, end),
        getInquiries(),
      ]);
      return sendJson(response, 200, { location, ...calendar, inquiries });
    }
    if (request.method === "POST") {
      const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
      const action = String(body?.action || "");
      const start = String(body?.start || "");
      const end = String(body?.end || "");
      const location = String(body?.location || "sh");
      const roomId = String(body?.roomId || (location === "hk" ? "hk-standard" : location === "lv" ? "lv-standard" : "standard"));
      const rate = Number(body?.rate ?? body?.rateCny ?? body?.rateUsd);
      const cleaningFee = Number(body?.cleaningFee);
      const weeklyRates = Array.isArray(body?.weeklyRates) ? body.weeklyRates.map(Number) : [];
      if (!validLocation(location)) return sendJson(response, 400, { error: "Invalid location." });
      if (action === "set_cleaning_fee") {
        const maximumFee = location === "sh" ? 100000 : 10000;
        if (!Number.isInteger(cleaningFee) || cleaningFee < 0 || cleaningFee > maximumFee) {
          return sendJson(response, 400, { error: `Enter a valid cleaning fee in ${location === "sh" ? "CNY" : "USD"}.` });
        }
        if (location === "hk") {
          await updateHongKongAdminCalendar({ action, cleaningFee });
        } else if (location === "lv") {
          await updateLasVegasAdminCalendar({ action, cleaningFee });
        } else {
          await updateAdminCalendar({ action, cleaningFee });
        }
        return sendJson(response, 200, { saved: true, location, cleaningFee });
      }
      if (!validDate(start) || !validDate(end) || end <= start) return sendJson(response, 400, { error: "Invalid date range." });
      if (action === "sync_pricelabs") {
        if (location === "sh") return sendJson(response, 400, { error: "PriceLabs sync is configured for Hong Kong and Las Vegas." });
        const prices = location === "lv" ? await getLasVegasPriceLabsPrices({ start, end }) : await getHongKongPriceLabsPrices({ start, end });
        const imported = location === "lv" ? await importLasVegasPriceLabsPrices({ prices }) : await importHongKongPriceLabsPrices({ prices });
        return sendJson(response, 200, { saved: true, location, imported, received: prices.length, start, end });
      }
      const roomIds = location === "hk" ? ["hk-standard"] : location === "lv" ? ["lv-standard"] : ["standard"];
      if (["set_price", "clear_price", "set_weekly_prices"].includes(action) && !roomIds.includes(roomId)) {
        return sendJson(response, 400, { error: "Invalid rate plan." });
      }
      const maximumRate = location === "sh" ? 100000 : 10000;
      if (action === "set_price" && (!Number.isInteger(rate) || rate < 1 || rate > maximumRate)) {
        return sendJson(response, 400, { error: `Enter a valid nightly price in ${location === "sh" ? "CNY" : "USD"}.` });
      }
      if (action === "set_weekly_prices" &&
        (weeklyRates.length !== 7 || weeklyRates.some((value) => !Number.isInteger(value) || value < 1 || value > maximumRate))) {
        return sendJson(response, 400, { error: `Enter all seven valid daily prices in ${location === "sh" ? "CNY" : "USD"}.` });
      }
      const note = String(body?.note || "").slice(0, 200);
      if (location === "hk") {
        await updateHongKongAdminCalendar({ action, start, end, roomId, rateUsd: rate, note, weeklyRates });
      } else if (location === "lv") {
        await updateLasVegasAdminCalendar({ action, start, end, roomId, rateUsd: rate, note, weeklyRates });
      } else {
        await updateAdminCalendar({ action, start, end, roomId, rateCny: rate, note, weeklyRates });
      }
      return sendJson(response, 200, { saved: true, location });
    }
    response.setHeader("Allow", "GET, POST");
    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    console.error("Admin calendar request failed", error);
    const message = String(error?.message || "");
    if (message.startsWith("PriceLabs") || message.startsWith("PRICELABS_") || message === "Unable to reach PriceLabs.") {
      return sendJson(response, 502, { error: message });
    }
    return sendJson(response, 500, { error: "Unable to update the booking calendar." });
  }
}
