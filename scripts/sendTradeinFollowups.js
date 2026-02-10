import pg from "pg";
import nodemailer from "nodemailer";

const { Pool } = pg;

function clean(s) {
  return String(s ?? "").trim().replace(/\s+/g, " ");
}

function formatSelections(selections) {
  if (!selections) return "N/A";

  if (Array.isArray(selections)) {
    return selections
      .map((p) => {
        const cat = clean(p?.Category || p?.category);
        const sub = clean(p?.Subgroup || p?.subgroup);
        const brand = clean(p?.Brand || p?.brand);
        const item = clean(p?.Item || p?.item);
        return [cat, sub, brand, item].filter(Boolean).join(" / ");
      })
      .filter(Boolean)
      .join("\n");
  }

  if (typeof selections === "object") {
    return JSON.stringify(selections, null, 2);
  }

  return clean(selections);
}

function pickEnv(...keys) {
  for (const k of keys) {
    const v = process.env[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
  }
  return "";
}

function toInt(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function main() {
  // --- DB ---
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) throw new Error("Missing DATABASE_URL");

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  // --- SMTP / Zoho (supports both naming schemes) ---
  const host = pickEnv("ZOHO_SMTP_HOST", "SMTP_HOST", "MAIL_HOST") || "smtppro.zoho.com";
  const port = toInt(pickEnv("ZOHO_SMTP_PORT", "SMTP_PORT", "MAIL_PORT"), 465);

  const user = pickEnv("ZOHO_SMTP_USER", "SMTP_USER", "MAIL_USER");
  const pass = pickEnv("ZOHO_SMTP_PASS", "SMTP_PASS", "MAIL_PASS");

  // Safe debug (won’t leak secrets)
  console.log("EMAIL CONFIG DEBUG", {
    host,
    port,
    secure: port === 465,
    hasUser: !!user,
    passLen: pass.length,
    from: pickEnv("SMTP_FROM", "MAIL_FROM") || "info@gamertech.ca",
  });

  if (!user || !pass) {
    // Fail the job loudly so you see it in Render logs
    throw new Error(
      "Missing SMTP credentials (user/pass). Check Render env vars: ZOHO_SMTP_USER/ZOHO_SMTP_PASS or SMTP_USER/SMTP_PASS."
    );
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // Zoho on 465 requires secure true
    auth: { user, pass },
  });

  // Optional but helpful: verify SMTP on each run (you can remove later)
  try {
    await transporter.verify();
    console.log("SMTP verify: OK");
  } catch (e) {
    throw new Error(`SMTP verify failed: ${String(e?.message || e)}`);
  }

  // --- Fetch due leads ---
  // NOTE: You currently require stage='BROWSING'. Keep or remove based on desired behavior.
  const { rows } = await pool.query(`
    SELECT id, name, email, selections, cash, credit
    FROM gtq_leads
    WHERE
      consent_email = TRUE
      AND followup_sent_at IS NULL
      AND followup_due_at IS NOT NULL
      AND followup_due_at <= NOW()
      AND email IS NOT NULL
      AND email <> ''
      AND stage = 'BROWSING'
    ORDER BY followup_due_at ASC
    LIMIT 25
  `);

  console.log(`Due leads found: ${rows.length}`);

  for (const lead of rows) {
    const name = clean(lead.name) || "there";
    const partsText = formatSelections(lead.selections);

    const cash = Number(lead.cash || 0);
    const credit = Number(lead.credit || 0);

    const subject = "Your GamerTech Trade-In Quote – Next Steps";
    const text = `Hi ${name},

Thanks for submitting your trade-in through our website.

We’ve reviewed the details for the following:
${partsText}

Your cash offer is: $${cash}
and your store credit offer is: $${credit}

I just wanted to follow up to see whether you were looking to trade your system/component in toward a new PC or if you were interested in a cash payout. Depending on your preference, we may be able to re-evaluate your trade-in and see if we can offer more than the instant quote provided online.

If this sounds like it would interest you, or if you have any questions, feel free to reply to this email or contact us directly at 905-247-7085. We’re happy to help.

Looking forward to hearing from you.

Best regards,
Aaron
GamerTech Team
`;

    const fromAddr = pickEnv("SMTP_FROM", "MAIL_FROM") || "info@gamertech.ca";

    try {
      await transporter.sendMail({
        from: `GamerTech <${fromAddr}>`,
        to: lead.email,
        subject,
        text,
      });

      await pool.query(
        `UPDATE gtq_leads
         SET followup_sent_at = NOW(),
             followup_error = NULL
         WHERE id = $1`,
        [lead.id]
      );

      console.log(`Sent follow-up to ${lead.email} (id=${lead.id})`);
    } catch (err) {
      // Save a detailed error message (still compact)
      const msg =
        String(err?.message || err) +
        (err?.code ? ` | code=${err.code}` : "") +
        (err?.response ? ` | response=${err.response}` : "");

      await pool.query(
        `UPDATE gtq_leads
         SET followup_error = $2
         WHERE id = $1`,
        [lead.id, msg]
      );

      console.error(`Failed to send to ${lead.email} (id=${lead.id}):`, msg);
    }
  }

  await pool.end();
}

main().catch((err) => {
  console.error("Cron job failed:", err);
  process.exit(1);
});