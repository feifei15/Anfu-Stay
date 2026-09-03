import assert from "node:assert/strict";
import test from "node:test";
import contactInquiry from "../api/contact-inquiry.mjs";

async function post(body) {
  let statusCode;
  let payload;
  const response = {
    status(value) { statusCode = value; return this; },
    setHeader() {},
    end(value) { payload = JSON.parse(value); },
  };
  await contactInquiry({ method: "POST", body }, response);
  return { statusCode, payload };
}

const base = {
  name: "Test Guest",
  destination: "shanghai",
  message: "I would like to ask about a future stay.",
  website: "",
  startedAt: Date.now() - 5000,
};

test("requires an email address when email is the preferred reply method", async () => {
  const result = await post({ ...base, preferredContact: "email", phone: "+1 555 0100" });
  assert.equal(result.statusCode, 400);
  assert.match(result.payload.error, /email address where we should reply/i);
});

test("requires a phone number for WhatsApp replies", async () => {
  const result = await post({ ...base, preferredContact: "whatsapp", email: "guest@example.com" });
  assert.equal(result.statusCode, 400);
  assert.match(result.payload.error, /phone number where we should reply/i);
});
