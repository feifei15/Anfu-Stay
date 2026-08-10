import { getStayQuote } from "../lib/booking-db.mjs";

const ROOMS = Object.freeze({
  standard: { nightlyRateCny: 1080, minimumNights: 1 },
  extended: { nightlyRateCny: 920, minimumNights: 7 },
});

function sendJson(response, status, body) {
  response.status(status).setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "");
}

export default async function availability(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return sendJson(response, 405, { error: "Method not allowed." });
  }
  const roomId = String(request.query?.roomId || "");
  const checkin = String(request.query?.checkin || "");
  const checkout = String(request.query?.checkout || "");
  const room = ROOMS[roomId];
  if (!room || !validDate(checkin) || !validDate(checkout)) {
    return sendJson(response, 400, { error: "Invalid room or dates." });
  }
  const nights = Math.round((new Date(`${checkout}T00:00:00Z`) - new Date(`${checkin}T00:00:00Z`)) / 86400000);
  if (nights < room.minimumNights || nights > 90) {
    return sendJson(response, 400, { error: `This stay requires ${room.minimumNights}–90 nights.` });
  }
  try {
    return sendJson(response, 200, await getStayQuote({
      roomId, checkin, checkout, defaultRateCny: room.nightlyRateCny,
    }));
  } catch (error) {
    console.error("Availability lookup failed", error);
    return sendJson(response, 503, { error: "Availability is temporarily unavailable." });
  }
}
