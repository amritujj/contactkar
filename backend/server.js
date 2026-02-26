require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET;
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const SENDER_EMAIL = process.env.SENDER_EMAIL;

app.use(express.json({ limit: '1mb' }));
app.use(cors());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
});

// -------------------- Helpers --------------------
function generateOtp() { return Math.floor(100000 + Math.random() * 900000).toString(); }
function addMinutes(date, mins) { return new Date(date.getTime() + mins * 60 * 1000); }

async function sendBrevoEmail(toEmail, subject, html) {
  if (!BREVO_API_KEY || !SENDER_EMAIL) return;
  await axios.post('https://api.brevo.com/v3/smtp/email',
    { sender: { name: 'ContactKar', email: SENDER_EMAIL }, to: [{ email: toEmail }], subject, htmlContent: html },
    { headers: { 'api-key': BREVO_API_KEY, 'content-type': 'application/json' }, timeout: 15000 }
  );
}

function signToken(userId) { return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '7d' }); }

function authRequired(req, res, next) {
  try {
    const hdr = req.headers.authorization;
    const token = hdr && hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
    if (!token) return res.status(401).json({ success: false, error: 'Missing token' });
    req.userId = jwt.verify(token, JWT_SECRET).id;
    next();
  } catch (e) {
    return res.status(401).json({ success: false, error: 'Invalid/expired token' });
  }
}

// -------------------- Health --------------------
app.get('/', (req, res) => res.status(200).send('ContactKar API is running'));

// -------------------- DB Setup --------------------
app.get('/api/setup-db', async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
        phone TEXT, password_hash TEXT NOT NULL, subscription_tier VARCHAR(20) DEFAULT 'basic',
        subscription_expiry TIMESTAMP, created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS tags (
        id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        tag_code TEXT UNIQUE NOT NULL, type TEXT NOT NULL DEFAULT 'vehicle',
        vehicle_number TEXT, pet_name TEXT, pet_breed TEXT, owner_name TEXT,
        emergency_contact TEXT, is_contactable BOOLEAN DEFAULT TRUE,
        is_hard_copy_ordered BOOLEAN DEFAULT FALSE, delivery_status VARCHAR(20) DEFAULT 'none',
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS email_otps (
        id SERIAL PRIMARY KEY, purpose TEXT NOT NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        email TEXT NOT NULL, otp_code TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL, used BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS pending_signups (
        id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
        password_hash TEXT NOT NULL, otp_code TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL, created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id),
        total_amount INTEGER NOT NULL, status VARCHAR(20) DEFAULT 'pending',
        shipping_address TEXT, items JSONB, created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    res.send('Database tables created/verified successfully!');
  } catch (e) { res.status(500).send('setup-db failed: ' + e.message); }
});

// -------------------- Auth: Signup --------------------
app.post('/api/auth/send-signup-otp', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) return res.status(400).json({ success: false, error: 'Missing fields' });
    const existing = await pool.query("SELECT id FROM users WHERE email=$1", [email]);
    if (existing.rows.length) return res.status(400).json({ success: false, error: 'Email already registered' });
    const otp = generateOtp();
    const hash = await bcrypt.hash(password, 10);
    const exp = addMinutes(new Date(), 10);
    await pool.query(
      "INSERT INTO pending_signups (email, name, password_hash, otp_code, expires_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (email) DO UPDATE SET name=$2, password_hash=$3, otp_code=$4, expires_at=$5",
      [email, name, hash, otp, exp]
    );
    await sendBrevoEmail(email, 'ContactKar - Verify your email',
      `<div style="font-family:Arial;max-width:500px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
        <h2 style="color:#2563eb">Verify your email</h2>
        <p>Your signup OTP is:</p>
        <div style="font-size:32px;font-weight:800;letter-spacing:8px;background:#f3f4f6;padding:16px;border-radius:10px;text-align:center">${otp}</div>
        <p style="color:#6b7280;font-size:14px">Expires in 10 minutes.</p>
      </div>`
    );
    res.json({ success: true, message: 'OTP sent' });
  } catch (e) { res.status(500).json({ success: false, error: 'Failed to send OTP' }); }
});

app.post('/api/auth/verify-signup-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ success: false, error: 'Missing fields' });
    const row = (await pool.query("SELECT * FROM pending_signups WHERE email=$1", [email])).rows[0];
    if (!row) return res.status(400).json({ success: false, error: 'OTP not requested' });
    if (new Date(row.expires_at) < new Date()) return res.status(400).json({ success: false, error: 'OTP expired' });
    if (row.otp_code !== otp) return res.status(400).json({ success: false, error: 'Invalid OTP' });
    const user = (await pool.query("INSERT INTO users (email, name, password_hash) VALUES ($1,$2,$3) RETURNING id, email, name", [row.email, row.name, row.password_hash])).rows[0];
    await pool.query("DELETE FROM pending_signups WHERE email=$1", [email]);
    res.json({ success: true, user, token: signToken(user.id) });
  } catch (e) { res.status(500).json({ success: false, error: 'Verification failed' }); }
});

// -------------------- Auth: Login --------------------
app.post('/api/auth/send-login-otp', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, error: 'Missing fields' });
    const user = (await pool.query("SELECT * FROM users WHERE email=$1", [email])).rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ success: false, error: 'Invalid credentials' });
    const otp = generateOtp();
    await pool.query("INSERT INTO email_otps (purpose, user_id, email, otp_code, expires_at) VALUES ('login',$1,$2,$3,$4)", [user.id, email, otp, addMinutes(new Date(), 10)]);
    await sendBrevoEmail(email, 'ContactKar - Your login OTP',
      `<div style="font-family:Arial;max-width:500px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
        <h2>Login Verification</h2>
        <div style="font-size:32px;font-weight:800;letter-spacing:8px;background:#f3f4f6;padding:16px;border-radius:10px;text-align:center">${otp}</div>
        <p style="color:#6b7280;font-size:14px">Expires in 10 minutes.</p>
      </div>`
    );
    res.json({ success: true, message: 'OTP sent' });
  } catch (e) { res.status(500).json({ success: false, error: 'Failed to send OTP' }); }
});

app.post('/api/auth/verify-login-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    const row = (await pool.query("SELECT * FROM email_otps WHERE purpose='login' AND email=$1 AND used=FALSE ORDER BY created_at DESC LIMIT 1", [email])).rows[0];
    if (!row || row.otp_code !== otp || new Date(row.expires_at) < new Date()) return res.status(400).json({ success: false, error: 'Invalid/expired OTP' });
    await pool.query("UPDATE email_otps SET used=TRUE WHERE id=$1", [row.id]);
    const user = (await pool.query("SELECT id, email, name FROM users WHERE id=$1", [row.user_id])).rows[0];
    res.json({ success: true, user, token: signToken(user.id) });
  } catch (e) { res.status(500).json({ success: false, error: 'Verification failed' }); }
});

// -------------------- Auth: Change Email --------------------
app.post('/api/auth/send-change-email-otp', authRequired, async (req, res) => {
  try {
    const user = (await pool.query("SELECT id, email FROM users WHERE id=$1", [req.userId])).rows[0];
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    const otp = generateOtp();
    await pool.query("INSERT INTO email_otps (purpose, user_id, email, otp_code, expires_at) VALUES ('change-email',$1,$2,$3,$4)", [user.id, user.email, otp, addMinutes(new Date(), 10)]);
    await sendBrevoEmail(user.email, 'ContactKar - OTP to change your email',
      `<div style="font-family:Arial;padding:24px"><h2 style="color:#ec4899">Email change request</h2><div style="font-size:32px;font-weight:800;letter-spacing:8px;background:#f3f4f6;padding:16px;border-radius:10px;text-align:center">${otp}</div></div>`
    );
    res.json({ success: true, message: 'OTP sent to current email' });
  } catch (e) { res.status(500).json({ success: false, error: 'Failed to send OTP' }); }
});

app.post('/api/auth/verify-change-email-otp', authRequired, async (req, res) => {
  try {
    const { otp, newEmail } = req.body;
    if (!otp || !newEmail) return res.status(400).json({ success: false, error: 'Missing fields' });
    if ((await pool.query("SELECT id FROM users WHERE email=$1", [newEmail])).rows.length) return res.status(400).json({ success: false, error: 'Email already in use' });
    const row = (await pool.query("SELECT * FROM email_otps WHERE purpose='change-email' AND user_id=$1 AND used=FALSE ORDER BY created_at DESC LIMIT 1", [req.userId])).rows[0];
    if (!row || row.otp_code !== otp || new Date(row.expires_at) < new Date()) return res.status(400).json({ success: false, error: 'Invalid/expired OTP' });
    await pool.query("UPDATE email_otps SET used=TRUE WHERE id=$1", [row.id]);
    await pool.query("UPDATE users SET email=$1 WHERE id=$2", [newEmail, req.userId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: 'Failed to update email' }); }
});

// -------------------- Profile --------------------
app.get('/api/me', authRequired, async (req, res) => {
  try {
    const r = await pool.query("SELECT id, email, name, phone, created_at FROM users WHERE id=$1", [req.userId]);
    res.json({ success: true, user: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: 'Failed' }); }
});

app.put('/api/me', authRequired, async (req, res) => {
  try {
    const { name, phone } = req.body;
    const r = await pool.query("UPDATE users SET name=COALESCE($1,name), phone=COALESCE($2,phone) WHERE id=$3 RETURNING id, email, name, phone", [name, phone, req.userId]);
    res.json({ success: true, user: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: 'Failed' }); }
});

// -------------------- Tags --------------------
app.get('/api/tags/user', authRequired, async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM tags WHERE user_id=$1 ORDER BY created_at DESC", [req.userId]);
    res.json({ success: true, tags: r.rows });
  } catch (e) { res.status(500).json({ success: false, error: 'Failed to fetch tags' }); }
});

app.put('/api/tags/:id/toggle', authRequired, async (req, res) => {
  try {
    const { isContactable } = req.body;
    const own = await pool.query("SELECT id FROM tags WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
    if (!own.rows.length) return res.status(404).json({ success: false, error: 'Tag not found' });
    await pool.query("UPDATE tags SET is_contactable=$1 WHERE id=$2", [!!isContactable, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: 'Failed to update' }); }
});

app.get('/api/tags/:code/qrcode', async (req, res) => {
  try {
    const url = `https://contactkar.vercel.app/tag/${encodeURIComponent(req.params.code)}`;
    const dataUrl = await QRCode.toDataURL(url);
    res.json({ success: true, code: req.params.code, qr: dataUrl });
  } catch (e) { res.status(500).json({ success: false, error: 'QR generation failed' }); }
});

// -------------------- Subscriptions --------------------
app.get('/api/billing/plan', authRequired, async (req, res) => {
  try {
    const r = await pool.query("SELECT subscription_tier, subscription_expiry FROM users WHERE id=$1", [req.userId]);
    res.json({ success: true, plan: r.rows[0] });
  } catch (e) { res.status(500).json({ success: false, error: 'Failed to fetch plan' }); }
});

app.post('/api/billing/upgrade', authRequired, async (req, res) => {
  try {
    const { tier } = req.body;
    if (!['basic', 'plus', 'pro'].includes(tier)) return res.status(400).json({ error: 'Invalid tier' });
    const expiry = new Date();
    expiry.setFullYear(expiry.getFullYear() + 1);
    await pool.query("UPDATE users SET subscription_tier=$1, subscription_expiry=$2 WHERE id=$3", [tier, expiry, req.userId]);
    res.json({ success: true, message: `Upgraded to ${tier.toUpperCase()} successfully!` });
  } catch (e) { res.status(500).json({ success: false, error: 'Upgrade failed: ' + e.message }); }
});

// -------------------- Orders --------------------
app.post('/api/orders/calculate', authRequired, async (req, res) => {
  const { vehicleQty = 0, petQty = 0 } = req.body;
  const totalTags = Number(vehicleQty) + Number(petQty);
  const freeDeliveries = totalTags >= 5 ? 2 : (totalTags >= 3 ? 1 : 0);
  const paidDeliveries = Math.max(0, totalTags - freeDeliveries);
  res.json({ totalTags, totalCost: paidDeliveries * 149, savings: freeDeliveries * 149, freeDeliveries });
});

app.post('/api/orders/place', authRequired, async (req, res) => {
  try {
    const { vehicleQty = 0, petQty = 0, address, city, state, pincode, vehiclenumber, vehicletype, ownername, emergency } = req.body;
    const vQty = Number(vehicleQty);
    const pQty = Number(petQty);
    const totalTags = vQty + pQty;
    if (totalTags === 0) return res.status(400).json({ error: 'Select at least 1 tag' });

    const isHardCopy = address && address !== 'Soft Copy';
    const fullAddress = isHardCopy ? `${address}, ${city}, ${state} - ${pincode}` : 'Soft Copy';
    const freeDeliveries = totalTags >= 5 ? 2 : (totalTags >= 3 ? 1 : 0);
    const totalCost = Math.max(0, totalTags - freeDeliveries) * 149;

    const order = await pool.query(
      "INSERT INTO orders (user_id, total_amount, shipping_address, items) VALUES ($1,$2,$3,$4) RETURNING id",
      [req.userId, totalCost, fullAddress, JSON.stringify({ vehicle: vQty, pet: pQty })]
    );

    // Generate Vehicle Tags
    for (let i = 0; i < vQty; i++) {
      const tagCode = 'CAR-' + Math.random().toString(36).substr(2, 6).toUpperCase();
      await pool.query(
        "INSERT INTO tags (user_id, tag_code, type, is_hard_copy_ordered, vehicle_number, owner_name, emergency_contact) VALUES ($1,$2,'vehicle',$3,$4,$5,$6)",
        [req.userId, tagCode, isHardCopy, vehiclenumber || null, ownername || null, emergency || null]
      );
    }

    // Generate Pet Tags
    for (let i = 0; i < pQty; i++) {
      const tagCode = 'PET-' + Math.random().toString(36).substr(2, 6).toUpperCase();
      await pool.query(
        "INSERT INTO tags (user_id, tag_code, type, is_hard_copy_ordered) VALUES ($1,$2,'pet',$3)",
        [req.userId, tagCode, isHardCopy]
      );
    }

    res.json({ success: true, message: 'Order placed successfully!', orderId: order.rows[0].id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to place order: ' + e.message });
  }
});

// -------------------- Start --------------------
app.listen(PORT, () => console.log(`ContactKar Server v4 running on ${PORT}`));