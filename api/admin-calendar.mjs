import crypto from "node:crypto";
import { getAdminCalendar, updateAdminCalendar } from "../lib/booking-db.mjs";
import { getHongKongAdminCalendar, updateHongKongAdminCalendar } from "../lib/booking-db-hk.mjs";

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
function validLocation(value) { return value === "sh" || value === "hk"; }

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
      const calendar = location === "hk"
        ? await getHongKongAdminCalendar(start, end)
        : await getAdminCalendar(start, end);
      return sendJson(response, 200, { location, ...calendar });
    }
    if (request.method === "POST") {
      const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
      const action = String(body?.action || "");
      const start = String(body?.start || "");
      const end = String(body?.end || "");
      const location = String(body?.location || "sh");
      const roomId = String(body?.roomId || (location === "hk" ? "hk-standard" : "standard"));
      const rate = Number(body?.rate ?? body?.rateCny ?? body?.rateUsd);
      if (!validDate(start) || !validDate(end) || end <= start) return sendJson(response, 400, { error: "Invalid date range." });
      if (!validLocation(location)) return sendJson(response, 400, { error: "Invalid location." });
      const roomIds = location === "hk" ? ["hk-standard", "hk-extended"] : ["standard", "extended"];
      if (["set_price", "clear_price"].includes(action) && !roomIds.includes(roomId)) {
        return sendJson(response, 400, { error: "Invalid rate plan." });
      }
      const maximumRate = location === "hk" ? 10000 : 100000;
      if (action === "set_price" && (!Number.isInteger(rate) || rate < 1 || rate > maximumRate)) {
        return sendJson(response, 400, { error: `Enter a valid nightly price in ${location === "hk" ? "USD" : "CNY"}.` });
      }
      const note = String(body?.note || "").slice(0, 200);
      if (location === "hk") {
        await updateHongKongAdminCalendar({ action, start, end, roomId, rateUsd: rate, note });
      } else {
        await updateAdminCalendar({ action, start, end, roomId, rateCny: rate, note });
      }
      return sendJson(response, 200, { saved: true, location });
    }
    response.setHeader("Allow", "GET, POST");
    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    console.error("Admin calendar request failed", error);
    return sendJson(response, 500, { error: "Unable to update the booking calendar." });
  }
}
