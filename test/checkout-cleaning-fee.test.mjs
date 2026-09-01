import test from "node:test";
import assert from "node:assert/strict";
import { stripeParameters } from "../api/create-checkout-session.js";

const baseQuote = {
  room: { name: "Anfu Residence" },
  roomId: "standard",
  checkin: "2026-09-03",
  checkout: "2026-09-06",
  guests: 2,
  nights: 3,
  accommodationTotalCny: 3150,
  holdId: "hold-test",
  baseUrl: "https://www.anfustay.com",
};

test("sends the adjustable cleaning fee to Stripe as a separate line item", () => {
  const parameters = stripeParameters({ ...baseQuote, cleaningFeeCny: 325 });
  assert.equal(parameters.get("line_items[0][price_data][unit_amount]"), "315000");
  assert.equal(parameters.get("line_items[1][price_data][unit_amount]"), "32500");
  assert.equal(3150 + 325, 3475);
});

test("omits the cleaning line item when the admin fee is zero", () => {
  const parameters = stripeParameters({ ...baseQuote, cleaningFeeCny: 0 });
  assert.equal(parameters.get("line_items[1][price_data][unit_amount]"), null);
});
