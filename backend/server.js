// backend/server.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const QRCode = require("qrcode");

const app = express();

/* -------------------- Config -------------------- */
const PORT = process.env.PORT || 10000; // Render supplies PORT; use fallback locally [web:211]
const JWT_SECRET = process.env.JWT_SECRET;
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const SENDER_EMAIL = process.env.SENDER_EMAIL;

if (!JWT_SECRET) console.warn("⚠️ Missing JWT_SECRET in environment");
if (!BREVO_API_KEY) console.warn("⚠️ Missing BREVO_API_KEY in environment");
if (!SENDER_EMAIL) console.warn("⚠️ Missing SENDER_EMAIL in environment");

app.use(express.json({ limit: "1mb" }));

// CORS: lock down later (for now allow all to reduce deployment friction)
app.use(cors());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
});

/* -------------------- Helpers -------------------- */
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits
}

function addMinutes(date, mins) {
  return new Date(date.getTime() + mins * 60 * 1000);
}

async function sendBrevoEmail({ toEmail, subject, html }) {
  if (!BREVO_API_KEY) throw new Error("Missing BREVO_API_KEY");
  if (!SENDER_EMAIL) throw new Error("Missing SENDER_EMAIL");

  await axios.post(
    "https://api.brevo.com/v3/smtp/email",
    {
      sender: { name: "ContactKar", email: SENDER_EMAIL },
      to: [{ email: toEmail }],
      subject,
      htmlContent: html,
    },
    {
      headers: {
        "api-key": BREVO_API_KEY,
        "content-type": "application/json",
        accept: "application/json",
      },
      timeout: 15000,
    }
  );
}

function signToken(userId) {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: "7d" });
}

function authRequired(req, res, next) {
  try {
    const hdr = req.headers.authorization || "";
    const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
    if (!token) return res.status(401).json({ success: false, error: "Missing token" });

    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.id;
    next();
  } catch {
    return res.status(401).json({ success: false, error: "Invalid/expired token" });
  }
}

/* -------------------- DB setup -------------------- */
// Run once manually: GET /api/setup-db
async function setupDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tags (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      tag_code TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL DEFAULT 'vehicle', -- vehicle|pet
      vehicle_number TEXT,
      pet_name TEXT,
      pet_breed TEXT,
      is_contactable BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW()
    );

    -- Stores OTPs for login/change-email, tied to a user or email
    CREATE TABLE IF NOT EXISTS email_otps (
      id SERIAL PRIMARY KEY,
      purpose TEXT NOT NULL,                 -- login|change_email
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      email TEXT NOT NULL,                   -- where we sent OTP
      otp_code TEXT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    );

    -- Stores signup OTP + pending signup data until verified
    CREATE TABLE IF NOT EXISTS pending_signups (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      otp_code TEXT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

/* -------------------- Health -------------------- */
app.get("/", (req, res) => {
  res.status(200).send("✅ ContactKar API is running");
});

app.get("/api/setup-db", async (req, res) => {
  try {
    await setupDb();
    res.send("✅ Database tables created/verified");
  } catch (e) {
    console.error(e);
    res.status(500).send("❌ setup-db failed: " + e.message);
  }
});

/* -------------------- Auth: Signup OTP -------------------- */
// Step 1: Send OTP (also stores pending signup)
app.post("/api/auth/send-signup-otp", async (req, res) => {
  try {
    const { email, password, name } = req.body || {};
    if (!email || !password || !name) return res.status(400).json({ success: false, error: "Missing fields" });

    await setupDb();

    const existing = await pool.query("SELECT id FROM users WHERE email=$1", [email]);
    if (existing.rows.length) return res.status(400).json({ success: false, error: "Email already registered" });

    const otp = generateOtp();
    const passwordHash = await bcrypt.hash(password, 10);
    const expiresAt = addMinutes(new Date(), 10);

    // Upsert pending signup
    await pool.query(
      `
      INSERT INTO pending_signups (email, name, password_hash, otp_code, expires_at)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (email)
      DO UPDATE SET name=$2, password_hash=$3, otp_code=$4, expires_at=$5
      `,
      [email, name, passwordHash, otp, expiresAt]
    );

    await sendBrevoEmail({
      toEmail: email,
      subject: "ContactKar - Verify your email (Signup OTP)",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px;">
          <h2 style="margin:0 0 12px;color:#2563eb;">Verify your email</h2>
          <p style="margin:0 0 16px;color:#374151;">Use this OTP to complete your ContactKar signup:</p>
          <div style="font-size:32px;font-weight:800;letter-spacing:8px;background:#f3f4f6;padding:16px;border-radius:10px;text-align:center;">${otp}</div>
          <p style="margin:16px 0 0;color:#6b7280;font-size:14px;">Expires in 10 minutes. Do not share.</p>
        </div>
      `,
    });

    res.json({ success: true, message: "OTP sent" });
  } catch (e) {
    console.error("send-signup-otp error:", e.response?.data || e.message);
    res.status(500).json({ success: false, error: "Failed to send OTP" });
  }
});

// Step 2: Verify OTP => Create user
app.post("/api/auth/verify-signup-otp", async (req, res) => {
  try {
    const { email, otp } = req.body || {};
    if (!email || !otp) return res.status(400).json({ success: false, error: "Missing fields" });

    await setupDb();

    const pending = await pool.query("SELECT * FROM pending_signups WHERE email=$1", [email]);
    if (!pending.rows.length) return res.status(400).json({ success: false, error: "OTP not requested or expired" });

    const row = pending.rows[0];
    if (new Date(row.expires_at) < new Date()) return res.status(400).json({ success: false, error: "OTP expired" });
    if (row.otp_code !== otp) return res.status(400).json({ success: false, error: "Invalid OTP" });

    const created = await pool.query(
      "INSERT INTO users (email, name, password_hash) VALUES ($1,$2,$3) RETURNING id,email,name",
      [row.email, row.name, row.password_hash]
    );

    await pool.query("DELETE FROM pending_signups WHERE email=$1", [email]);

    const user = created.rows[0];
    const token = signToken(user.id);
    res.json({ success: true, user, token });
  } catch (e) {
    console.error("verify-signup-otp error:", e.message);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
});

/* -------------------- Auth: Login OTP -------------------- */
// Step 1: Check password, then send OTP to email
app.post("/api/auth/send-login-otp", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ success: false, error: "Missing fields" });

    await setupDb();

    const userRes = await pool.query("SELECT id,email,name,password_hash FROM users WHERE email=$1", [email]);
    if (!userRes.rows.length) return res.status(401).json({ success: false, error: "Invalid credentials" });

    const user = userRes.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ success: false, error: "Invalid credentials" });

    const otp = generateOtp();
    const expiresAt = addMinutes(new Date(), 10);

    await pool.query(
      "INSERT INTO email_otps (purpose,user_id,email,otp_code,expires_at) VALUES ($1,$2,$3,$4,$5)",
      ["login", user.id, user.email, otp, expiresAt]
    );

    await sendBrevoEmail({
      toEmail: user.email,
      subject: "ContactKar - Your login OTP",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px;">
          <h2 style="margin:0 0 12px;color:#111827;">Login verification</h2>
          <p style="margin:0 0 16px;color:#374151;">Use this OTP to login:</p>
          <div style="font-size:32px;font-weight:800;letter-spacing:8px;background:#f3f4f6;padding:16px;border-radius:10px;text-align:center;">${otp}</div>
          <p style="margin:16px 0 0;color:#6b7280;font-size:14px;">Expires in 10 minutes. Do not share.</p>
        </div>
      `,
    });

    res.json({ success: true, message: "OTP sent" });
  } catch (e) {
    console.error("send-login-otp error:", e.response?.data || e.message);
    res.status(500).json({ success: false, error: "Failed to send OTP" });
  }
});

// Step 2: Verify OTP => issue token
app.post("/api/auth/verify-login-otp", async (req, res) => {
  try {
    const { email, otp } = req.body || {};
    if (!email || !otp) return res.status(400).json({ success: false, error: "Missing fields" });

    await setupDb();

    const q = await pool.query(
      `
      SELECT * FROM email_otps
      WHERE purpose='login' AND email=$1 AND used=FALSE
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [email]
    );

    if (!q.rows.length) return res.status(400).json({ success: false, error: "OTP not requested or expired" });
    const row = q.rows[0];

    if (new Date(row.expires_at) < new Date()) return res.status(400).json({ success: false, error: "OTP expired" });
    if (row.otp_code !== otp) return res.status(400).json({ success: false, error: "Invalid OTP" });

    await pool.query("UPDATE email_otps SET used=TRUE WHERE id=$1", [row.id]);

    const userRes = await pool.query("SELECT id,email,name FROM users WHERE id=$1", [row.user_id]);
    const user = userRes.rows[0];

    const token = signToken(user.id);
    res.json({ success: true, user, token });
  } catch (e) {
    console.error("verify-login-otp error:", e.message);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
});

/* -------------------- Auth: Change email (OTP to OLD email) -------------------- */
app.post("/api/auth/send-change-email-otp", authRequired, async (req, res) => {
  try {
    await setupDb();

    const userRes = await pool.query("SELECT id,email,name FROM users WHERE id=$1", [req.userId]);
    if (!userRes.rows.length) return res.status(404).json({ success: false, error: "User not found" });
    const user = userRes.rows[0];

    const otp = generateOtp();
    const expiresAt = addMinutes(new Date(), 10);

    await pool.query(
      "INSERT INTO email_otps (purpose,user_id,email,otp_code,expires_at) VALUES ($1,$2,$3,$4,$5)",
      ["change_email", user.id, user.email, otp, expiresAt]
    );

    await sendBrevoEmail({
      toEmail: user.email, // OLD email
      subject: "ContactKar - OTP to change your email",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px;">
          <h2 style="margin:0 0 12px;color:#ec4899;">Email change request</h2>
          <p style="margin:0 0 16px;color:#374151;">Use this OTP to confirm changing your account email:</p>
          <div style="font-size:32px;font-weight:800;letter-spacing:8px;background:#f3f4f6;padding:16px;border-radius:10px;text-align:center;">${otp}</div>
          <p style="margin:16px 0 0;color:#6b7280;font-size:14px;">Expires in 10 minutes. If you didn’t request this, ignore this email.</p>
        </div>
      `,
    });

    res.json({ success: true, message: "OTP sent to current email" });
  } catch (e) {
    console.error("send-change-email-otp error:", e.response?.data || e.message);
    res.status(500).json({ success: false, error: "Failed to send OTP" });
  }
});
app.get('/api/setup-v2', async (req, res) => {
    try {
        // 1. Update Users Table
        await pool.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(20) DEFAULT 'basic',
            ADD COLUMN IF NOT EXISTS subscription_expiry TIMESTAMP,
            ADD COLUMN IF NOT EXISTS address TEXT, 
            ADD COLUMN IF NOT EXISTS city TEXT, 
            ADD COLUMN IF NOT EXISTS state TEXT, 
            ADD COLUMN IF NOT EXISTS pincode VARCHAR(10);
        `);

        // 2. Create Orders Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                total_amount INTEGER NOT NULL,
                status VARCHAR(20) DEFAULT 'pending',
                shipping_address TEXT,
                items JSONB,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);

        // 3. Update Tags Table
        await pool.query(`
            ALTER TABLE tags 
            ADD COLUMN IF NOT EXISTS is_hard_copy_ordered BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(20) DEFAULT 'none',
            ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'vehicle';
        `);

        res.json({ success: true, message: "Database updated successfully for V2!" });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, error: e.message });
    }
});


app.post("/api/auth/verify-change-email-otp", authRequired, async (req, res) => {
  try {
    const { otp, newEmail } = req.body || {};
    if (!otp || !newEmail) return res.status(400).json({ success: false, error: "Missing fields" });

    await setupDb();

    // Ensure new email not taken
    const taken = await pool.query("SELECT id FROM users WHERE email=$1", [newEmail]);
    if (taken.rows.length) return res.status(400).json({ success: false, error: "Email already in use" });

    const q = await pool.query(
      `
      SELECT * FROM email_otps
      WHERE purpose='change_email' AND user_id=$1 AND used=FALSE
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [req.userId]
    );

    if (!q.rows.length) return res.status(400).json({ success: false, error: "OTP not requested or expired" });
    const row = q.rows[0];

    if (new Date(row.expires_at) < new Date()) return res.status(400).json({ success: false, error: "OTP expired" });
    if (row.otp_code !== otp) return res.status(400).json({ success: false, error: "Invalid OTP" });

    await pool.query("UPDATE email_otps SET used=TRUE WHERE id=$1", [row.id]);
    await pool.query("UPDATE users SET email=$1 WHERE id=$2", [newEmail, req.userId]);

    res.json({ success: true });
  } catch (e) {
    console.error("verify-change-email-otp error:", e.message);
    res.status(500).json({ success: false, error: "Failed to update email" });
  }
});

/* -------------------- Profile -------------------- */
app.get("/api/me", authRequired, async (req, res) => {
  try {
    await setupDb();
    const r = await pool.query("SELECT id,email,name,phone,created_at FROM users WHERE id=$1", [req.userId]);
    res.json({ success: true, user: r.rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, error: "Failed" });
  }
});

app.put("/api/me", authRequired, async (req, res) => {
  try {
    const { name, phone } = req.body || {};
    await setupDb();
    const r = await pool.query(
      "UPDATE users SET name=COALESCE($1,name), phone=COALESCE($2,phone) WHERE id=$3 RETURNING id,email,name,phone",
      [name, phone, req.userId]
    );
    res.json({ success: true, user: r.rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, error: "Failed" });
  }
});

/* -------------------- Tags -------------------- */
app.get("/api/tags/user", authRequired, async (req, res) => {
  try {
    await setupDb();
    const r = await pool.query("SELECT * FROM tags WHERE user_id=$1 ORDER BY created_at DESC", [req.userId]);
    res.json({ success: true, tags: r.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: "Failed to fetch tags" });
  }
});

app.put("/api/tags/:id/toggle", authRequired, async (req, res) => {
  try {
    const tagId = Number(req.params.id);
    const { isContactable } = req.body || {};
    await setupDb();

    // Ensure tag belongs to this user
    const own = await pool.query("SELECT id FROM tags WHERE id=$1 AND user_id=$2", [tagId, req.userId]);
    if (!own.rows.length) return res.status(404).json({ success: false, error: "Tag not found" });

    await pool.query("UPDATE tags SET is_contactable=$1 WHERE id=$2", [!!isContactable, tagId]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: "Failed to update" });
  }
});

// Optional: generate QR code for a tag_code (example)
app.get("/api/tags/:code/qrcode", async (req, res) => {
  try {
    const code = req.params.code;
    const url = `https://contactkar.vercel.app/tag/${encodeURIComponent(code)}`;
    const dataUrl = await QRCode.toDataURL(url);
    res.json({ success: true, code, qr: dataUrl });
  } catch (e) {
    res.status(500).json({ success: false, error: "QR generation failed" });
  }
});
// Add this below your existing routes

const HARD_COPY_PRICE = 149;

// Calculate Pricing API
app.post('/api/orders/calculate', authRequired, async (req, res) => {
    const { vehicleQty, petQty } = req.body;
    const totalTags = (vehicleQty || 0) + (petQty || 0);
    
    let freeDeliveries = 0;
    if (totalTags >= 5) freeDeliveries = 2;
    else if (totalTags >= 3) freeDeliveries = 1;

    const paidDeliveries = Math.max(0, totalTags - freeDeliveries);
    const totalCost = paidDeliveries * HARD_COPY_PRICE;
    const savings = freeDeliveries * HARD_COPY_PRICE;

    res.json({ totalTags, totalCost, savings, freeDeliveries });
});

// Place Order API
app.post('/api/orders/place', authRequired, async (req, res) => {
    const { vehicleQty = 0, petQty = 0, address, city, state, pincode } = req.body;
    const totalTags = (vehicleQty || 0) + (petQty || 0);
    
    if (totalTags === 0) return res.status(400).json({ error: "Please select at least 1 tag" });

    // Recalculate on backend for security
    let freeDeliveries = 0;
    if (totalTags >= 5) freeDeliveries = 2;
    else if (totalTags >= 3) freeDeliveries = 1;
    const totalCost = Math.max(0, totalTags - freeDeliveries) * HARD_COPY_PRICE;
    const fullAddress = `${address}, ${city}, ${state} - ${pincode}`;

    try {
        // 1. Create Order Record
        const orderResult = await pool.query(
            "INSERT INTO orders (user_id, total_amount, shipping_address, items) VALUES ($1, $2, $3, $4) RETURNING id",
            [req.userId, totalCost, fullAddress, JSON.stringify({ vehicle: vehicleQty, pet: petQty })]
        );

        // 2. Generate Vehicle Tags
        for(let i=0; i < vehicleQty; i++) {
            const tagCode = 'CAR-' + Math.random().toString(36).substr(2, 6).toUpperCase();
            await pool.query(
                "INSERT INTO tags (user_id, tag_code, type, is_hard_copy_ordered) VALUES ($1, $2, 'vehicle', TRUE)", 
                [req.userId, tagCode]
            );
        }

        // 3. Generate Pet Tags
        for(let i=0; i < petQty; i++) {
            const tagCode = 'PET-' + Math.random().toString(36).substr(2, 6).toUpperCase();
            await pool.query(
                "INSERT INTO tags (user_id, tag_code, type, is_hard_copy_ordered) VALUES ($1, $2, 'pet', TRUE)", 
                [req.userId, tagCode]
            );
        }

        res.json({ success: true, message: "Order placed successfully!", orderId: orderResult.rows[0].id });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to place order" });
    }
});


/* -------------------- Start (ONLY ONCE) -------------------- */
app.listen(PORT, () => {
  console.log(`✅ ContactKar Server v3 running on ${PORT}`);
});