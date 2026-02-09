import pg from "pg";
import nodemailer from "nodemailer";

const { Pool } = pg;

function clean(s) {
  return String(s ?? "").trim().replace(/\s+/g, " ");
}

function formatSelections(selections) {
  // selections is JSONB in your table. We'll format it safely.
  if (!selections) return "N/A";

  // If it's your parts array:
  if (Array.isArray(selections)) {
    return selections
      .map(p => {
        const cat = clean(p?.Category || p?.category);
        const sub = clean(p?.Subgroup || p?.subgroup);
        const brand = clean(p?.Brand || p?.brand);
        const item = clean(p?.Item || p?.item);
        // build a readable line
        return [cat, sub, brand, item].filter(Boolean).join(" / ");
      })
      .filter(Boolean)
      .join("\n");
  }

  // If it's an object (like full PC spec structure), stringify nicely:
  if (typeof selections === "object") {
    return JSON.stringify(selections, null, 2);
  }

  return clean(selections);
}

async function main() {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) throw new Error("Missing DATABASE_URL");

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const host = process.env.ZOHO_SMTP_HOST || "smtppro.zoho.com";
  const port = Number(process.env.ZOHO_SMTP_PORT || 465);

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user: process.env.ZOHO_SMTP_USER, // info@gamertech.ca
      pass: process.env.ZOHO_SMTP_PASS, // Zoho app password recommended
    },
  });

  // Pull a small batch each run
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

    try {
      await transporter.sendMail({
        from: "GamerTech <info@gamertech.ca>",
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
    } catch (err) {
      await pool.query(
        `UPDATE gtq_leads
         SET followup_error = $2
         WHERE id = $1`,
        [lead.id, String(err?.message || err)]
      );
    }
  }

  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});