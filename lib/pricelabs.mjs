const PRICELABS_PRICES_URL = "https://api.pricelabs.co/v1/listing_prices";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function pricingRows(payload) {
  if (Array.isArray(payload?.pricing_array)) return payload.pricing_array;
  if (Array.isArray(payload?.prices)) return payload.prices;
  const listing = (Array.isArray(payload?.listings) ? payload.listings[0] : null) ||
    (Array.isArray(payload) ? payload[0] : null);
  if (listing?.error) throw new Error(`PriceLabs: ${listing.error}`);
  if (Array.isArray(listing?.pricing_array)) return listing.pricing_array;
  if (Array.isArray(listing?.prices)) return listing.prices;
  return [];
}

export async function getHongKongPriceLabsPrices({ start, end }) {
  const apiKey = required("PRICELABS_API_KEY");
  const listingId = required("PRICELABS_HK_LISTING_ID");
  const pms = required("PRICELABS_HK_PMS");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let response;
  try {
    response = await fetch(PRICELABS_PRICES_URL, {
      method: "POST",
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ listings: [{ id: listingId, pms }] }),
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("PriceLabs took too long to respond.");
    throw new Error("Unable to reach PriceLabs.");
  } finally {
    clearTimeout(timeout);
  }

  let payload;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok) throw new Error(String(payload?.error || payload?.message || `PriceLabs returned ${response.status}.`).slice(0, 300));
  const prices = pricingRows(payload)
    .filter(row => /^\d{4}-\d{2}-\d{2}$/.test(String(row?.date || "")) && row.date >= start && row.date < end)
    .map(row => ({ date: row.date, rateUsd: Math.round(Number(row.user_price ?? row.price)) }))
    .filter(row => Number.isInteger(row.rateUsd) && row.rateUsd > 0 && row.rateUsd <= 10000);
  if (!prices.length) throw new Error("PriceLabs returned no valid USD prices for this calendar period.");
  return prices;
}
