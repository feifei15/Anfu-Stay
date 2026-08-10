import crypto from "node:crypto";
import { getAdminCalendar, updateAdminCalendar } from "../lib/booking-db.mjs";

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

export default async function adminCalendar(request, response) {
  if (!authorized(request)) {
    response.setHeader("WWW-Authenticate", 'Basic realm="Anfu Stay Admin"');
    return sendJson(response, 401, { error: "Authentication required." });
  }
  try {
    if (request.method === "GET") {
      const start = String(request.query?.start || "");
      const end = String(request.query?.end || "");
      if (!validDate(start) || !validDate(end)) return sendJson(response, 400, { error: "Invalid date range." });
      return sendJson(response, 200, await getAdminCalendar(start, end));
    }
    if (request.method === "POST") {
      const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
      const action = String(body?.action || "");
      const start = String(body?.start || "");
      const end = String(body?.end || "");
      const roomId = String(body?.roomId || "standard");
      const rateCny = Number(body?.rateCny);
      if (!validDate(start) || !validDate(end) || end <= start) return sendJson(response, 400, { error: "Invalid date range." });
      if (["set_price", "clear_price"].includes(action) && !["standard", "extended"].includes(roomId)) {
        return sendJson(response, 400, { error: "Invalid rate plan." });
      }
      if (action === "set_price" && (!Number.isInteger(rateCny) || rateCny < 1 || rateCny > 100000)) {
        return sendJson(response, 400, { error: "Enter a valid nightly price in CNY." });
      }
      await updateAdminCalendar({ action, start, end, roomId, rateCny, note: String(body?.note || "").slice(0, 200) });
      return sendJson(response, 200, { saved: true });
    }
    response.setHeader("Allow", "GET, POST");
    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    console.error("Admin calendar request failed", error);
    return sendJson(response, 500, { error: "Unable to update the booking calendar." });
  }
}
