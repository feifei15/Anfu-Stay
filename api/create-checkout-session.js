const ROOMS = Object.freeze({
  standard: {
    name: "Anfu Residence",
    nightlyRateCny: 1080,
    minimumNights: 1,
  },
  extended: {
    name: "Anfu Residence · Extended Stay",
    nightlyRateCny: 920,
    minimumNights: 7,
  },
});

const CLEANING_FEE_CNY = 280;
const MAXIMUM_NIGHTS = 90;
const ALLOWED_PRODUCTION_HOSTS = new Set(["anfustay.com", "www.anfustay.com"]);

function sendJson(response, status, body) {
  response.status(status).setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return date;
}

function checkoutBaseUrl(request) {
  const host = String(request.headers["x-forwarded-host"] || request.headers.host || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  const isPreview = host.endsWith(".vercel.app");
  const isLocal = host === "localhost" || host.startsWith("localhost:");
  if (!ALLOWED_PRODUCTION_HOSTS.has(host) && !isPreview && !isLocal) return null;
  return `${isLocal ? "http" : "https"}://${host}`;
}

function stripeParameters({ room, roomId, checkin, checkout, guests, nights, baseUrl }) {
  const parameters = new URLSearchParams();
  parameters.set("mode", "payment");
  parameters.set("locale", "auto");
  parameters.set("customer_creation", "always");
  parameters.set("phone_number_collection[enabled]", "true");
  parameters.set("success_url", `${baseUrl}/sh/booking/success.html?session_id={CHECKOUT_SESSION_ID}`);
  parameters.set("cancel_url", `${baseUrl}/sh/booking/?checkout=cancelled`);

  parameters.set("line_items[0][quantity]", String(nights));
  parameters.set("line_items[0][price_data][currency]", "cny");
  parameters.set("line_items[0][price_data][unit_amount]", String(room.nightlyRateCny * 100));
  parameters.set("line_items[0][price_data][product_data][name]", room.name);
  parameters.set(
    "line_items[0][price_data][product_data][description]",
    `${checkin} to ${checkout} · ${guests} guest${guests === 1 ? "" : "s"}`,
  );

  parameters.set("line_items[1][quantity]", "1");
  parameters.set("line_items[1][price_data][currency]", "cny");
  parameters.set("line_items[1][price_data][unit_amount]", String(CLEANING_FEE_CNY * 100));
  parameters.set("line_items[1][price_data][product_data][name]", "Cleaning fee");

  parameters.set("metadata[room_id]", roomId);
  parameters.set("metadata[checkin]", checkin);
  parameters.set("metadata[checkout]", checkout);
  parameters.set("metadata[nights]", String(nights));
  parameters.set("metadata[guests]", String(guests));
  return parameters;
}

module.exports = async function createCheckoutSession(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "Method not allowed." });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return sendJson(response, 503, { error: "Secure payment is not configured." });
  }

  const baseUrl = checkoutBaseUrl(request);
  if (!baseUrl) return sendJson(response, 400, { error: "Invalid booking origin." });

  let body = request.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return sendJson(response, 400, { error: "Invalid request." });
    }
  }

  const roomId = String(body?.roomId || "");
  const checkin = String(body?.checkin || "");
  const checkout = String(body?.checkout || "");
  const guests = Number(body?.guests);
  const room = ROOMS[roomId];
  const checkinDate = parseDate(checkin);
  const checkoutDate = parseDate(checkout);

  if (!room || !checkinDate || !checkoutDate || !Number.isInteger(guests) || guests < 1 || guests > 4) {
    return sendJson(response, 400, { error: "Please review the room, dates, and guest count." });
  }

  const nights = Math.round((checkoutDate - checkinDate) / 86400000);
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (
    checkinDate.getTime() < todayUtc ||
    nights < room.minimumNights ||
    nights > MAXIMUM_NIGHTS
  ) {
    return sendJson(response, 400, {
      error: `This stay requires ${room.minimumNights}–${MAXIMUM_NIGHTS} nights and a future check-in date.`,
    });
  }

  try {
    const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Stripe-Version": "2026-02-25.clover",
      },
      body: stripeParameters({ room, roomId, checkin, checkout, guests, nights, baseUrl }),
    });
    const session = await stripeResponse.json();
    if (!stripeResponse.ok || !session.url) {
      console.error("Stripe Checkout Session creation failed", {
        status: stripeResponse.status,
        type: session?.error?.type,
        code: session?.error?.code,
      });
      return sendJson(response, 502, { error: "Unable to start secure payment. Please try again." });
    }
    return sendJson(response, 200, { url: session.url });
  } catch (error) {
    console.error("Stripe Checkout request failed", error);
    return sendJson(response, 502, { error: "Unable to reach secure payment. Please try again." });
  }
};
