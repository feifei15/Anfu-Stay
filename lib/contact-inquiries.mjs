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
    await sql`CREATE TABLE IF NOT EXISTS contact_inquiries (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name text NOT NULL,
      email text,
      phone text,
      preferred_contact text NOT NULL,
      destination text NOT NULL,
      message text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
    await sql`CREATE INDEX IF NOT EXISTS contact_inquiries_created_at_idx
      ON contact_inquiries (created_at DESC)`;
  })().catch(error => { schemaReady = undefined; throw error; });
  await schemaReady;
}

export async function saveInquiry({ name, email, phone, preferredContact, destination, message }) {
  await ensureSchema();
  const sql = sqlClient();
  const rows = await sql`INSERT INTO contact_inquiries
    (name, email, phone, preferred_contact, destination, message)
    VALUES (${name}, ${email || null}, ${phone || null}, ${preferredContact}, ${destination}, ${message})
    RETURNING id, created_at`;
  return rows[0];
}

export async function getInquiries(limit = 100) {
  await ensureSchema();
  const sql = sqlClient();
  return sql`SELECT id, name, email, phone, preferred_contact, destination, message, created_at
    FROM contact_inquiries ORDER BY created_at DESC LIMIT ${limit}`;
}
