import { neon } from "@neondatabase/serverless";
import { getLasVegasAirbnbBlockedDates } from "./airbnb-calendar.mjs";

let database;
let schemaReady;
const sqlClient = () => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");
  return database ||= neon(process.env.DATABASE_URL);
};

async function ensureSchema() {
  if (!schemaReady) schemaReady = (async () => {
    const sql = sqlClient();
    await sql`CREATE TABLE IF NOT EXISTS lv_bookings (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, stripe_session_id text NOT NULL UNIQUE,
      payment_intent_id text, status text NOT NULL, room_id text NOT NULL, checkin date NOT NULL,
      checkout date NOT NULL, guests integer NOT NULL, customer_email text, amount_total integer,
      currency text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`;
    await sql`CREATE TABLE IF NOT EXISTS lv_inventory_nights (
      stay_date date PRIMARY KEY, status text NOT NULL CHECK (status IN ('manual_block','hold','booking')),
      hold_id text, stripe_session_id text, booking_id bigint REFERENCES lv_bookings(id),
      expires_at timestamptz, note text, updated_at timestamptz NOT NULL DEFAULT now())`;
    await sql`CREATE TABLE IF NOT EXISTS lv_pricing_overrides (
      room_id text NOT NULL, stay_date date NOT NULL, nightly_rate_usd integer NOT NULL CHECK (nightly_rate_usd > 0),
      source text NOT NULL DEFAULT 'manual', updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (room_id, stay_date))`;
    await sql`CREATE TABLE IF NOT EXISTS lv_weekly_pricing_defaults (
      room_id text NOT NULL, iso_day integer NOT NULL CHECK (iso_day BETWEEN 1 AND 7),
      nightly_rate_usd integer NOT NULL CHECK (nightly_rate_usd > 0), updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (room_id, iso_day))`;
    await sql`CREATE TABLE IF NOT EXISTS booking_settings (
      location text PRIMARY KEY, cleaning_fee integer NOT NULL CHECK (cleaning_fee >= 0),
      updated_at timestamptz NOT NULL DEFAULT now())`;
    await sql`INSERT INTO booking_settings (location, cleaning_fee) VALUES ('lv', 75) ON CONFLICT (location) DO NOTHING`;
  })().catch(error => { schemaReady = undefined; throw error; });
  await schemaReady;
}

export async function getLasVegasStayQuote({ roomId, checkin, checkout, discountPercent = 0 }) {
  await ensureSchema(); const sql = sqlClient();
  const [rows, settings, airbnbBlockedDates] = await Promise.all([
    sql`WITH requested AS (SELECT day::date AS stay_date FROM generate_series(${checkin}::date, ${checkout}::date - 1, interval '1 day') day)
      SELECT requested.stay_date::text, inventory.status,
        (COALESCE(pricing.nightly_rate_usd, weekly.nightly_rate_usd,
          CASE WHEN extract(isodow FROM requested.stay_date) IN (5,6) THEN 250 ELSE 200 END
        ) * (100 - ${discountPercent}) / 100.0)::integer AS nightly_rate_usd
      FROM requested LEFT JOIN lv_inventory_nights inventory ON inventory.stay_date=requested.stay_date
        AND (inventory.status <> 'hold' OR inventory.expires_at > now())
      LEFT JOIN lv_pricing_overrides pricing ON pricing.room_id=${roomId} AND pricing.stay_date=requested.stay_date
      LEFT JOIN lv_weekly_pricing_defaults weekly ON weekly.room_id=${roomId} AND weekly.iso_day=extract(isodow FROM requested.stay_date)
      ORDER BY requested.stay_date`,
    sql`SELECT cleaning_fee FROM booking_settings WHERE location='lv'`,
    getLasVegasAirbnbBlockedDates({ start: checkin, end: checkout }),
  ]);
  const blockedDates = [...new Set([...rows.filter(row => row.status).map(row => row.stay_date), ...airbnbBlockedDates])].sort();
  const accommodationTotalUsd = rows.reduce((sum, row) => sum + Number(row.nightly_rate_usd), 0);
  const cleaningFeeUsd = Number(settings[0]?.cleaning_fee ?? 75);
  return { available: rows.length > 0 && !blockedDates.length, blockedDates, nights: rows.length,
    accommodationTotalUsd, averageNightlyRateUsd: rows.length ? Math.round(accommodationTotalUsd / rows.length) : 0,
    cleaningFeeUsd, totalUsd: accommodationTotalUsd + cleaningFeeUsd, discountPercent };
}

export async function getLasVegasAdminCalendar(start, end) {
  await ensureSchema(); const sql = sqlClient();
  const [inventory, prices, bookings, weeklyDefaults, settings, airbnbBlockedDates] = await Promise.all([
    sql`SELECT stay_date::text, status, note, expires_at, stripe_session_id FROM lv_inventory_nights
      WHERE stay_date >= ${start}::date AND stay_date < ${end}::date AND (status <> 'hold' OR expires_at > now()) ORDER BY stay_date`,
    sql`SELECT room_id, stay_date::text, nightly_rate_usd, source FROM lv_pricing_overrides
      WHERE stay_date >= ${start}::date AND stay_date < ${end}::date ORDER BY stay_date, room_id`,
    sql`SELECT id, stripe_session_id, status, room_id, checkin::text, checkout::text, guests, customer_email,
      amount_total, currency, created_at FROM lv_bookings WHERE checkout > ${start}::date AND checkin < ${end}::date ORDER BY checkin`,
    sql`SELECT room_id, iso_day, nightly_rate_usd FROM lv_weekly_pricing_defaults ORDER BY room_id, iso_day`,
    sql`SELECT cleaning_fee FROM booking_settings WHERE location='lv'`,
    getLasVegasAirbnbBlockedDates({ start, end }),
  ]);
  const inventoryDates = new Set(inventory.map(row => row.stay_date));
  for (const stayDate of airbnbBlockedDates) if (!inventoryDates.has(stayDate)) inventory.push({ stay_date: stayDate, status: "airbnb_block", note: "Airbnb reservation" });
  inventory.sort((a, b) => a.stay_date.localeCompare(b.stay_date));
  return { inventory, prices, bookings, weeklyDefaults, cleaningFee: Number(settings[0]?.cleaning_fee ?? 75) };
}

export async function importLasVegasPriceLabsPrices({ roomId = "lv-standard", prices }) {
  await ensureSchema(); const sql = sqlClient();
  const rows = JSON.stringify(prices.map(({ date, rateUsd }) => ({ date, rateUsd })));
  const result = await sql`WITH incoming AS (SELECT value->>'date' stay_date,(value->>'rateUsd')::integer nightly_rate_usd FROM jsonb_array_elements(${rows}::jsonb))
    INSERT INTO lv_pricing_overrides (room_id,stay_date,nightly_rate_usd,source) SELECT ${roomId},stay_date::date,nightly_rate_usd,'pricelabs' FROM incoming
    ON CONFLICT (room_id,stay_date) DO UPDATE SET nightly_rate_usd=EXCLUDED.nightly_rate_usd,source='pricelabs',updated_at=now()
    WHERE lv_pricing_overrides.source='pricelabs' RETURNING stay_date`;
  return result.length;
}

export async function holdLasVegasStay({ holdId, checkin, checkout }) {
  await ensureSchema(); const sql=sqlClient();
  const result=await sql`WITH requested AS (SELECT day::date stay_date FROM generate_series(${checkin}::date,${checkout}::date-1,interval '1 day') day), inserted AS (
    INSERT INTO lv_inventory_nights (stay_date,status,hold_id,expires_at) SELECT stay_date,'hold',${holdId},now()+interval '30 minutes' FROM requested
    ON CONFLICT (stay_date) DO UPDATE SET status='hold',hold_id=EXCLUDED.hold_id,expires_at=EXCLUDED.expires_at,stripe_session_id=NULL,booking_id=NULL,note=NULL,updated_at=now()
    WHERE lv_inventory_nights.status='hold' AND lv_inventory_nights.expires_at<=now() RETURNING stay_date)
    SELECT (SELECT count(*)::integer FROM requested) requested,(SELECT count(*)::integer FROM inserted) inserted`;
  if(result[0].requested!==result[0].inserted){await releaseLasVegasHold(holdId);return false;} return true;
}
export async function attachLasVegasStripeSession(holdId,sessionId){await ensureSchema();await sqlClient()`UPDATE lv_inventory_nights SET stripe_session_id=${sessionId},updated_at=now() WHERE hold_id=${holdId}`;}
export async function releaseLasVegasHold(holdId){await ensureSchema();await sqlClient()`DELETE FROM lv_inventory_nights WHERE hold_id=${holdId} AND status='hold'`;}
export async function extendLasVegasPendingHold(holdId){await ensureSchema();await sqlClient()`UPDATE lv_inventory_nights SET expires_at=now()+interval '7 days',updated_at=now() WHERE hold_id=${holdId} AND status='hold'`;}
export async function confirmLasVegasBooking(session){await ensureSchema();const sql=sqlClient(),m=session.metadata||{};if(!m.hold_id)return;const rows=await sql`INSERT INTO lv_bookings (stripe_session_id,payment_intent_id,status,room_id,checkin,checkout,guests,customer_email,amount_total,currency)
  VALUES (${session.id},${session.payment_intent||null},'confirmed',${m.room_id},${m.checkin}::date,${m.checkout}::date,${Number(m.guests)},${session.customer_details?.email||session.customer_email||null},${session.amount_total||null},${session.currency||null})
  ON CONFLICT (stripe_session_id) DO UPDATE SET status='confirmed',payment_intent_id=EXCLUDED.payment_intent_id,customer_email=EXCLUDED.customer_email,amount_total=EXCLUDED.amount_total,currency=EXCLUDED.currency,updated_at=now() RETURNING id`;
  await sql`UPDATE lv_inventory_nights SET status='booking',booking_id=${rows[0].id},expires_at=NULL,updated_at=now() WHERE hold_id=${m.hold_id}`;}

export async function updateLasVegasAdminCalendar({ action, start, end, roomId, rateUsd, note, weeklyRates, cleaningFee }) {
  await ensureSchema(); const sql = sqlClient();
  if (action === "set_cleaning_fee") await sql`INSERT INTO booking_settings (location, cleaning_fee) VALUES ('lv', ${cleaningFee}) ON CONFLICT (location) DO UPDATE SET cleaning_fee=EXCLUDED.cleaning_fee,updated_at=now()`;
  else if (action === "block") await sql`INSERT INTO lv_inventory_nights (stay_date,status,note) SELECT day::date,'manual_block',${note || null} FROM generate_series(${start}::date,${end}::date-1,interval '1 day') day ON CONFLICT (stay_date) DO UPDATE SET status='manual_block',note=EXCLUDED.note,hold_id=NULL,stripe_session_id=NULL,booking_id=NULL,expires_at=NULL,updated_at=now() WHERE lv_inventory_nights.status <> 'booking'`;
  else if (action === "unblock") await sql`DELETE FROM lv_inventory_nights WHERE stay_date>=${start}::date AND stay_date<${end}::date AND status='manual_block'`;
  else if (action === "set_price") await sql`INSERT INTO lv_pricing_overrides (room_id,stay_date,nightly_rate_usd,source) SELECT ${roomId},day::date,${rateUsd},'manual' FROM generate_series(${start}::date,${end}::date-1,interval '1 day') day ON CONFLICT (room_id,stay_date) DO UPDATE SET nightly_rate_usd=EXCLUDED.nightly_rate_usd,source='manual',updated_at=now()`;
  else if (action === "clear_price") await sql`DELETE FROM lv_pricing_overrides WHERE room_id=${roomId} AND stay_date>=${start}::date AND stay_date<${end}::date`;
  else if (action === "set_weekly_prices") await Promise.all(weeklyRates.map((rate,index)=>sql`INSERT INTO lv_weekly_pricing_defaults (room_id,iso_day,nightly_rate_usd) VALUES (${roomId},${index+1},${rate}) ON CONFLICT (room_id,iso_day) DO UPDATE SET nightly_rate_usd=EXCLUDED.nightly_rate_usd,updated_at=now()`));
  else throw new Error("Unsupported calendar action.");
}
