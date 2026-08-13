import { neon } from "@neondatabase/serverless";

let database;
let schemaReady;

function sqlClient() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");
  if (!database) database = neon(process.env.DATABASE_URL);
  return database;
}

async function ensureSchema() {
  if (!schemaReady) schemaReady = (async () => {
    const sql = sqlClient();
    await sql`CREATE TABLE IF NOT EXISTS hk_bookings (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, stripe_session_id text NOT NULL UNIQUE,
      payment_intent_id text, status text NOT NULL, room_id text NOT NULL, checkin date NOT NULL,
      checkout date NOT NULL, guests integer NOT NULL, customer_email text, amount_total integer,
      currency text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`;
    await sql`CREATE TABLE IF NOT EXISTS hk_inventory_nights (
      stay_date date PRIMARY KEY, status text NOT NULL CHECK (status IN ('manual_block','hold','booking')),
      hold_id text, stripe_session_id text, booking_id bigint REFERENCES hk_bookings(id),
      expires_at timestamptz, note text, updated_at timestamptz NOT NULL DEFAULT now())`;
  })().catch(error => { schemaReady = undefined; throw error; });
  await schemaReady;
}

function rate(date) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 5 || day === 6 ? 140 : 120;
}

export async function getHongKongStayQuote({ checkin, checkout }) {
  await ensureSchema(); const sql = sqlClient();
  const rows = await sql`WITH requested AS (
    SELECT day::date AS stay_date FROM generate_series(${checkin}::date, ${checkout}::date - 1, interval '1 day') day)
    SELECT requested.stay_date::text, inventory.status FROM requested
    LEFT JOIN hk_inventory_nights inventory ON inventory.stay_date=requested.stay_date
      AND (inventory.status <> 'hold' OR inventory.expires_at > now()) ORDER BY requested.stay_date`;
  const blockedDates = rows.filter(row => row.status).map(row => row.stay_date);
  const accommodationTotalUsd = rows.reduce((sum, row) => sum + rate(row.stay_date), 0);
  return { available: rows.length > 0 && !blockedDates.length, blockedDates, nights: rows.length,
    accommodationTotalUsd, averageNightlyRateUsd: rows.length ? Math.round(accommodationTotalUsd / rows.length) : 0 };
}

export async function holdHongKongStay({ holdId, checkin, checkout }) {
  await ensureSchema(); const sql = sqlClient();
  const result = await sql`WITH requested AS (
    SELECT day::date AS stay_date FROM generate_series(${checkin}::date, ${checkout}::date - 1, interval '1 day') day),
    inserted AS (INSERT INTO hk_inventory_nights (stay_date,status,hold_id,expires_at)
      SELECT stay_date,'hold',${holdId},now()+interval '30 minutes' FROM requested
      ON CONFLICT (stay_date) DO UPDATE SET status='hold',hold_id=EXCLUDED.hold_id,expires_at=EXCLUDED.expires_at,
      stripe_session_id=NULL,booking_id=NULL,note=NULL,updated_at=now()
      WHERE hk_inventory_nights.status='hold' AND hk_inventory_nights.expires_at<=now() RETURNING stay_date)
    SELECT (SELECT count(*)::integer FROM requested) requested,(SELECT count(*)::integer FROM inserted) inserted`;
  if (result[0].requested !== result[0].inserted) { await releaseHongKongHold(holdId); return false; }
  return true;
}

export async function attachHongKongStripeSession(holdId, sessionId) {
  await ensureSchema(); const sql=sqlClient();
  await sql`UPDATE hk_inventory_nights SET stripe_session_id=${sessionId},updated_at=now() WHERE hold_id=${holdId}`;
}
export async function releaseHongKongHold(holdId) {
  await ensureSchema(); const sql=sqlClient(); await sql`DELETE FROM hk_inventory_nights WHERE hold_id=${holdId} AND status='hold'`;
}
export async function extendHongKongPendingHold(holdId) {
  await ensureSchema(); const sql=sqlClient(); await sql`UPDATE hk_inventory_nights SET expires_at=now()+interval '7 days',updated_at=now() WHERE hold_id=${holdId} AND status='hold'`;
}
export async function confirmHongKongBooking(session) {
  await ensureSchema(); const sql=sqlClient(); const m=session.metadata||{}; if (!m.hold_id) return;
  const rows=await sql`INSERT INTO hk_bookings (stripe_session_id,payment_intent_id,status,room_id,checkin,checkout,guests,customer_email,amount_total,currency)
    VALUES (${session.id},${session.payment_intent||null},'confirmed',${m.room_id},${m.checkin}::date,${m.checkout}::date,${Number(m.guests)},
    ${session.customer_details?.email||session.customer_email||null},${session.amount_total||null},${session.currency||null})
    ON CONFLICT (stripe_session_id) DO UPDATE SET status='confirmed',payment_intent_id=EXCLUDED.payment_intent_id,
    customer_email=EXCLUDED.customer_email,amount_total=EXCLUDED.amount_total,currency=EXCLUDED.currency,updated_at=now() RETURNING id`;
  await sql`UPDATE hk_inventory_nights SET status='booking',booking_id=${rows[0].id},expires_at=NULL,updated_at=now() WHERE hold_id=${m.hold_id}`;
}
