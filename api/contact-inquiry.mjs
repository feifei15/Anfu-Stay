import { saveInquiry } from "../lib/contact-inquiries.mjs";

function sendJson(response, status, body) {
  response.status(status).setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function contactInquiry(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "Method not allowed." });
  }
  try {
    const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body || {};
    if (String(body.website || "")) return sendJson(response, 200, { saved: true });
    const name = String(body.name || "").trim().slice(0, 100);
    const email = String(body.email || "").trim().toLowerCase().slice(0, 200);
    const phone = String(body.phone || "").trim().slice(0, 80);
    const preferredContact = String(body.preferredContact || "email").trim().slice(0, 30);
    const destination = String(body.destination || "not-sure").trim().slice(0, 30);
    const message = String(body.message || "").trim().slice(0, 3000);
    const startedAt = Number(body.startedAt || 0);
    if (Date.now() - startedAt < 1500) return sendJson(response, 400, { error: "Please review your message and try again." });
    if (name.length < 2 || message.length < 10) return sendJson(response, 400, { error: "Please enter your name and a short message." });
    if (!email && !phone) return sendJson(response, 400, { error: "Please enter an email address or phone number." });
    if (email && !emailPattern.test(email)) return sendJson(response, 400, { error: "Please enter a valid email address." });
    if (!['email','phone','whatsapp'].includes(preferredContact)) return sendJson(response, 400, { error: "Please select a contact method." });
    if (preferredContact === 'email' && !email) return sendJson(response, 400, { error: "Please enter the email address where we should reply." });
    if (preferredContact !== 'email' && !phone) return sendJson(response, 400, { error: "Please enter the phone number where we should reply." });
    if (!['shanghai','hong-kong','las-vegas','not-sure'].includes(destination)) return sendJson(response, 400, { error: "Please select a destination." });
    const inquiry = await saveInquiry({ name, email, phone, preferredContact, destination, message });
    return sendJson(response, 201, { saved: true, id: inquiry.id });
  } catch (error) {
    console.error("Contact inquiry failed", error);
    return sendJson(response, 500, { error: "We could not send your inquiry. Please try again." });
  }
}
