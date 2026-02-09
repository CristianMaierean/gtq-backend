import pg from "pg";
const { Pool } = pg;

let pool = null;

function getPool() {
  if (pool) return pool;

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Missing DATABASE_URL env var.");

  pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });

  return pool;
}

export async function initLeadTable() {
  const p = getPool();

  // Base table
  await p.query(`
    CREATE TABLE IF NOT EXISTS gtq_leads (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      name TEXT,
      stage TEXT NOT NULL,           -- BROWSING | COMPLETED
      category TEXT,
      mode TEXT,
      selections JSONB,
      quantity INT,
      cash INT,
      credit INT,
      page TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Ensure unique (email, phone)
  await p.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS gtq_leads_email_phone_uidx
    ON gtq_leads (email, phone);
  `);

  // ---- Add follow-up related columns if missing ----
  // These are safe even if you already added them earlier.
  await p.query(`ALTER TABLE gtq_leads ADD COLUMN IF NOT EXISTS consent_email BOOLEAN NOT NULL DEFAULT TRUE;`);
  await p.query(`ALTER TABLE gtq_leads ADD COLUMN IF NOT EXISTS followup_due_at TIMESTAMPTZ;`);
  await p.query(`ALTER TABLE gtq_leads ADD COLUMN IF NOT EXISTS followup_sent_at TIMESTAMPTZ;`);
  await p.query(`ALTER TABLE gtq_leads ADD COLUMN IF NOT EXISTS followup_error TEXT;`);
}

function cleanStr(s) {
  return String(s ?? "").trim();
}

function cleanEmail(s) {
  return cleanStr(s).toLowerCase();
}

function digits10(s) {
  return cleanStr(s).replace(/\D/g, "").slice(0, 10);
}

export async function upsertLead(payload) {
  const p = getPool();

  const email = cleanEmail(payload?.email);
  const phone = digits10(payload?.phone);

  if (!email || !phone) return;

  const name = cleanStr(payload?.name) || null;
  const stage = cleanStr(payload?.stage) || "BROWSING";

  const category = payload?.category ?? null;
  const mode = payload?.mode ?? null;

  const selections = payload?.selections ?? payload?.quote?.selections ?? null;
  const quantity = Number.isFinite(payload?.quantity)
    ? payload.quantity
    : (Number.isFinite(payload?.quote?.quantity) ? payload.quote.quantity : null);

  const cash = Number.isFinite(payload?.cash)
    ? payload.cash
    : (Number.isFinite(payload?.quote?.cash) ? payload.quote.cash : null);

  const credit = Number.isFinite(payload?.credit)
    ? payload.credit
    : (Number.isFinite(payload?.quote?.credit) ? payload.quote.credit : null);

  const page = payload?.page ?? null;

  // If your frontend ever sends something like payload.consent_email, respect it.
  // Otherwise default TRUE.
  const consentEmail =
    typeof payload?.consent_email === "boolean" ? payload.consent_email : true;

    await p.query(
    `
    INSERT INTO gtq_leads (
      email, phone, name, stage, category, mode, selections, quantity, cash, credit, page, consent_email,
      followup_due_at, followup_sent_at, followup_error
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
      CASE
        WHEN $4 = 'BROWSING' THEN NOW() + INTERVAL '1 hour'
        ELSE NULL
      END,
      NULL,
      NULL
    )
    ON CONFLICT (email, phone)
    DO UPDATE SET
      name = COALESCE(EXCLUDED.name, gtq_leads.name),
      stage = EXCLUDED.stage,
      category = COALESCE(EXCLUDED.category, gtq_leads.category),
      mode = COALESCE(EXCLUDED.mode, gtq_leads.mode),
      selections = COALESCE(EXCLUDED.selections, gtq_leads.selections),
      quantity = COALESCE(EXCLUDED.quantity, gtq_leads.quantity),
      cash = COALESCE(EXCLUDED.cash, gtq_leads.cash),
      credit = COALESCE(EXCLUDED.credit, gtq_leads.credit),
      page = COALESCE(EXCLUDED.page, gtq_leads.page),
      consent_email = COALESCE(EXCLUDED.consent_email, gtq_leads.consent_email),

      -- schedule ONLY for BROWSING (once), cancel if COMPLETED
      followup_due_at = CASE
        WHEN EXCLUDED.stage = 'COMPLETED' THEN NULL
        WHEN gtq_leads.followup_due_at IS NULL
          AND gtq_leads.followup_sent_at IS NULL
          AND EXCLUDED.stage = 'BROWSING'
        THEN NOW() + INTERVAL '1 hour'
        ELSE gtq_leads.followup_due_at
      END,

      followup_sent_at = CASE
        WHEN EXCLUDED.stage = 'COMPLETED' THEN NULL
        ELSE gtq_leads.followup_sent_at
      END,

      followup_error = CASE
        WHEN EXCLUDED.stage = 'COMPLETED' THEN NULL
        ELSE gtq_leads.followup_error
      END,

      updated_at = NOW()
    `,
    [
      email,
      phone,
      name,
      stage,
      category,
      mode,
      selections ? JSON.stringify(selections) : null,
      quantity,
      cash,
      credit,
      page,
      consentEmail,
    ]
  );
}