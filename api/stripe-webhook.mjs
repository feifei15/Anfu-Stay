import crypto from "node:crypto";
import { confirmBooking, extendPendingHold, releaseHold } from "../lib/booking-db.mjs";

const SIGNATURE_TOLERANCE_SECONDS = 300;

function sendJson(response, status, body) {
  response.status(status).setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

async function readRawBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function secureEqual(left, right) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyStripeSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const parts = String(signatureHeader).split(",");
  const timestampPart = parts.find((part) => part.startsWith("t="));
  const signatures = parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  const timestamp = Number(timestampPart?.slice(2));
  if (!Number.isFinite(timestamp) || signatures.length === 0) return false;

  const age = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (age > SIGNATURE_TOLERANCE_SECONDS) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody.toString("utf8")}`)
    .digest("hex");
  return signatures.some((signature) => secureEqual(signature, expected));
}

export default async function stripeWebhook(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "Method not allowed." });
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return sendJson(response, 503, { error: "Stripe webhook is not configured." });
  }

  const rawBody = await readRawBody(request);
  if (!verifyStripeSignature(rawBody, request.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET)) {
    return sendJson(response, 400, { error: "Invalid Stripe signature." });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return sendJson(response, 400, { error: "Invalid webhook payload." });
  }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object;
    if (event.type === "checkout.session.async_payment_succeeded" || session.payment_status === "paid") {
      await confirmBooking(session);
    } else if (session.metadata?.hold_id) {
      await extendPendingHold(session.metadata.hold_id);
    }
    console.log("booking_payment_confirmed", {
      eventId: event.id,
      eventType: event.type,
      checkoutSessionId: session.id,
      paymentIntentId: session.payment_intent,
      paymentStatus: session.payment_status,
      customerEmail: session.customer_details?.email || session.customer_email,
      amountTotal: session.amount_total,
      currency: session.currency,
      roomId: session.metadata?.room_id,
      checkin: session.metadata?.checkin,
      checkout: session.metadata?.checkout,
      nights: session.metadata?.nights,
      guests: session.metadata?.guests,
    });
  } else if (event.type === "checkout.session.async_payment_failed") {
    const session = event.data.object;
    if (session.metadata?.hold_id) await releaseHold(session.metadata.hold_id);
    console.warn("booking_payment_failed", {
      eventId: event.id,
      checkoutSessionId: session.id,
      roomId: session.metadata?.room_id,
    });
  }

  return sendJson(response, 200, { received: true });
}

export const config = {
  api: {
    bodyParser: false,
  },
};
