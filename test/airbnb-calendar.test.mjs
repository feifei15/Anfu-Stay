import test from "node:test";
import assert from "node:assert/strict";
import { parseAirbnbCalendar } from "../lib/airbnb-calendar.mjs";

test("parses Airbnb all-day stays as nights and ignores cancelled events", () => {
  const calendar = `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20260916\r\nDTEND;VALUE=DATE:20260919\r\nSUMMARY:Reserved\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261001\r\nDTEND;VALUE=DATE:20261003\r\nSTATUS:CANCELLED\r\nEND:VEVENT\r\nEND:VCALENDAR`;
  assert.deepEqual(parseAirbnbCalendar(calendar), ["2026-09-16", "2026-09-17", "2026-09-18"]);
});

test("unfolds folded iCalendar property lines and deduplicates dates", () => {
  const calendar = `BEGIN:VEVENT\nDTSTART;VALUE=\n DATE:20260918\nDTEND;VALUE=DATE:20260920\nEND:VEVENT\nBEGIN:VEVENT\nDTSTART:20260919T000000Z\nDTEND:20260921T000000Z\nEND:VEVENT`;
  assert.deepEqual(parseAirbnbCalendar(calendar), ["2026-09-18", "2026-09-19", "2026-09-20"]);
});
