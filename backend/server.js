// ContactKar Backend Server - Updated v2.0
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.get("/", (req, res) => {
  res.status(200).send("✅ ContactKar API is running");
});

// Magic endpoint to create database tables automatically!
app.get('/api/setup-db', async (req, res) => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                phone VARCHAR(15),
                password_hash VARCHAR(255) NOT NULL,
                name VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                privacy_settings JSONB DEFAULT '{"allow_contact": true}'
            );
            CREATE TABLE IF NOT EXISTS tags (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                tag_code VARCHAR(20) UNIQUE NOT NULL,
                qr_code_url TEXT,
                type VARCHAR(20) DEFAULT 'vehicle',
                vehicle_number VARCHAR(20),
                pet_name VARCHAR(50),
                is_contactable BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS vehicle_registry_table (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                plate_number VARCHAR(20) UNIQUE NOT NULL
            );
        `);
        res.send("✅ Database tables created successfully!");
    } catch (err) {
        console.error(err);
        res.status(500).send("❌ Error creating tables: " + err.message);
    }
});


const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Middleware
const verifyToken = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(403).json({ error: 'No token provided' });
    jwt.verify(token.split(' ')[1], JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ error: 'Invalid token' });
        req.userId = decoded.id;
        next();
    });
};

function generateTagCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'CK-';
    for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
}

// ========== AUTH ==========
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, name } = req.body;
        const userCheck = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userCheck.rows.length > 0) return res.status(400).json({ error: 'Email already registered' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name',
            [email, hashedPassword, name]
        );
        const token = jwt.sign({ id: result.rows[0].id }, JWT_SECRET);
        res.json({ success: true, user: result.rows[0], token });
    } catch (error) { res.status(500).json({ error: 'Registration failed' }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

        const validPassword = await bcrypt.compare(password, result.rows[0].password_hash);
        if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' });

        const token = jwt.sign({ id: result.rows[0].id }, JWT_SECRET);
        res.json({ success: true, user: { id: result.rows[0].id, name: result.rows[0].name }, token });
    } catch (error) { res.status(500).json({ error: 'Login failed' }); }
});

// ========== TAGS & PETS ==========

// Create Tag (Vehicle or Pet)
app.post('/api/tags/create', verifyToken, async (req, res) => {
    try {
        const { type, vehicleNumber, petName, petBreed, emergencyContact, planType } = req.body;
        const tagCode = generateTagCode();
        const qrUrl = `https://contactkar.in/contact/${tagCode}`;
        const qrCodeDataUrl = await QRCode.toDataURL(qrUrl);

        // Insert into Tags Table
        const result = await pool.query(
            `INSERT INTO tags 
            (user_id, tag_code, qr_code_url, type, vehicle_number, pet_name, pet_breed, emergency_contact, plan_type) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [req.userId, tagCode, qrCodeDataUrl, type, vehicleNumber, petName, petBreed, emergencyContact, planType]
        );

        // If Vehicle, also register in Vehicle Registry for Search
        if (type === 'vehicle' && vehicleNumber) {
            await pool.query(
                'INSERT INTO vehicle_registry_table (user_id, plate_number) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                [req.userId, vehicleNumber]
            );
        }

        res.json({ success: true, tag: result.rows[0] });
    } catch (error) { console.error(error); res.status(500).json({ error: 'Creation failed' }); }
});

// Get User Tags
app.get('/api/tags/user', verifyToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM tags WHERE user_id = $1 ORDER BY created_at DESC', [req.userId]);
        res.json({ success: true, tags: result.rows });
    } catch (error) { res.status(500).json({ error: 'Fetch failed' }); }
});

// Toggle Privacy (Contactable ON/OFF)
app.put('/api/tags/:id/toggle', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { isContactable } = req.body; // Boolean
        const result = await pool.query(
            'UPDATE tags SET is_contactable = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
            [isContactable, id, req.userId]
        );
        res.json({ success: true, tag: result.rows[0] });
    } catch (error) { res.status(500).json({ error: 'Update failed' }); }
});

// ========== SEARCH & CALL ==========

// Search by Plate
app.post('/api/search/plate', async (req, res) => {
    try {
        const { plateNumber } = req.body;
        // Find owner via registry or tags
        const result = await pool.query(
            `SELECT t.tag_code, t.is_contactable 
             FROM tags t 
             WHERE t.vehicle_number = $1 AND t.type = 'vehicle'`,
            [plateNumber]
        );

        if (result.rows.length === 0) return res.status(404).json({ found: false });

        const tag = result.rows[0];
        if (!tag.is_contactable) return res.status(200).json({ found: true, contactable: false, message: "Owner has disabled calls." });

        res.json({ found: true, contactable: true, tagCode: tag.tag_code });
    } catch (error) { res.status(500).json({ error: 'Search failed' }); }
});

// Initiate Call Bridge (Secure Call)
app.post('/api/contact/call-bridge', async (req, res) => {
    try {
        const { tagCode, callerNumber } = req.body;

        // 1. Fetch Owner Phone from DB
        const tagResult = await pool.query(
            'SELECT u.phone FROM tags t JOIN users u ON t.user_id = u.id WHERE t.tag_code = $1',
            [tagCode]
        );

        if (tagResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });
        const ownerPhone = tagResult.rows[0].phone;

        // 2. Call Cloud Telephony API (Exotel/Twilio)
        // This is where you would make the actual API call to bridge two numbers
        // Example logic:
        // await exotel.connectCalls(callerNumber, ownerPhone);

        // 3. Log the call
        await pool.query(
            'INSERT INTO contact_logs (tag_id, contact_type, caller_number) VALUES ((SELECT id FROM tags WHERE tag_code=$1), $2, $3)',
            [tagCode, 'call_bridge', callerNumber]
        );

        res.json({ success: true, message: 'Call initiating...' });
    } catch (error) { 
        console.error(error); 
        res.status(500).json({ error: 'Call failed' }); 
    }
});
const axios = require('axios');

// In-memory OTP store (use Redis in production)
const otpStore = {};

// Generate random 6-digit OTP
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send email via Brevo
async function sendEmailViaBrevo(toEmail, subject, htmlContent) {
    await axios.post('https://api.brevo.com/v3/smtp/email', {
        sender: { name: "ContactKar", email: process.env.SENDER_EMAIL },
        to: [{ email: toEmail }],
        subject: subject,
        htmlContent: htmlContent
    }, {
        headers: {
            'api-key': process.env.BREVO_API_KEY,
            'Content-Type': 'application/json'
        }
    });
}

// ===== SIGNUP: Send OTP =====
app.post('/api/auth/send-signup-otp', async (req, res) => {
    try {
        const { email, password, name } = req.body;
        if (!email || !password || !name) return res.status(400).json({ error: 'All fields required' });

        // Check if already registered
        const userCheck = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userCheck.rows.length > 0) return res.status(400).json({ error: 'Email already registered' });

        // Generate & store OTP (with 10 min expiry)
        const otp = generateOTP();
        otpStore[email] = { otp, password, name, expiresAt: Date.now() + 10 * 60 * 1000 };

        // Send via Brevo
        await sendEmailViaBrevo(email, 'ContactKar - Verify Your Email',
            `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:30px;border-radius:10px;border:1px solid #e5e7eb;">
                <h2 style="color:#2563eb;">Welcome to ContactKar!</h2>
                <p>Your account verification code is:</p>
                <div style="font-size:2.5rem;font-weight:bold;letter-spacing:10px;color:#1f2937;background:#f3f4f6;padding:20px;border-radius:8px;text-align:center;">${otp}</div>
                <p style="color:#6b7280;margin-top:20px;font-size:0.9rem;">This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>
                <p style="color:#6b7280;font-size:0.9rem;">If you didn't request this, please ignore this email.</p>
            </div>`
        );

        res.json({ success: true, message: 'OTP sent to your email' });
    } catch (error) {
        console.error('Send signup OTP error:', error.response?.data || error.message);
        res.status(500).json({ error: 'Failed to send OTP' });
    }
});

// ===== SIGNUP: Verify OTP & Create Account =====
app.post('/api/auth/verify-signup-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;
        const stored = otpStore[email];

        if (!stored) return res.status(400).json({ error: 'OTP expired or not requested' });
        if (Date.now() > stored.expiresAt) { delete otpStore[email]; return res.status(400).json({ error: 'OTP expired. Please register again.' }); }
        if (stored.otp !== otp) return res.status(400).json({ error: 'Invalid OTP' });

        // OTP correct — create the account
        const hashedPassword = await bcrypt.hash(stored.password, 10);
        const result = await pool.query(
            'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name',
            [email, hashedPassword, stored.name]
        );
        delete otpStore[email]; // Clear OTP after use

        const token = jwt.sign({ id: result.rows[0].id }, process.env.JWT_SECRET);
        res.json({ success: true, user: result.rows[0], token });
    } catch (error) {
        console.error('Verify signup OTP error:', error);
        res.status(500).json({ error: 'Verification failed' });
    }
});

// ===== LOGIN: Send OTP =====
app.post('/api/auth/send-login-otp', async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

        const validPassword = await bcrypt.compare(password, result.rows[0].password_hash);
        if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' });

        // Generate & send OTP
        const otp = generateOTP();
        otpStore[email] = { otp, userId: result.rows[0].id, name: result.rows[0].name, expiresAt: Date.now() + 10 * 60 * 1000 };

        await sendEmailViaBrevo(email, 'ContactKar - Your Login Code',
            `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:30px;border-radius:10px;border:1px solid #e5e7eb;">
                <h2 style="color:#2563eb;">Your Login Code</h2>
                <p>Use this code to complete your login:</p>
                <div style="font-size:2.5rem;font-weight:bold;letter-spacing:10px;color:#1f2937;background:#f3f4f6;padding:20px;border-radius:8px;text-align:center;">${otp}</div>
                <p style="color:#6b7280;margin-top:20px;font-size:0.9rem;">Expires in <strong>10 minutes</strong>. Do not share.</p>
            </div>`
        );

        res.json({ success: true, message: 'OTP sent to your email' });
    } catch (error) {
        console.error('Send login OTP error:', error.response?.data || error.message);
        res.status(500).json({ error: 'Failed to send OTP' });
    }
});

// ===== LOGIN: Verify OTP & Issue Token =====
app.post('/api/auth/verify-login-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;
        const stored = otpStore[email];

        if (!stored) return res.status(400).json({ error: 'OTP expired or not requested' });
        if (Date.now() > stored.expiresAt) { delete otpStore[email]; return res.status(400).json({ error: 'OTP expired. Please login again.' }); }
        if (stored.otp !== otp) return res.status(400).json({ error: 'Invalid OTP' });

        delete otpStore[email];
        const token = jwt.sign({ id: stored.userId }, process.env.JWT_SECRET);
        res.json({ success: true, user: { id: stored.userId, name: stored.name }, token });
    } catch (error) {
        res.status(500).json({ error: 'Verification failed' });
    }
});

// ===== DASHBOARD: Send OTP to Change Email =====
app.post('/api/auth/send-change-email-otp', verifyToken, async (req, res) => {
    try {
        const userResult = await pool.query('SELECT email FROM users WHERE id = $1', [req.userId]);
        const currentEmail = userResult.rows[0].email;

        const otp = generateOTP();
        otpStore['change_' + req.userId] = { otp, expiresAt: Date.now() + 10 * 60 * 1000 };

        await sendEmailViaBrevo(currentEmail, 'ContactKar - Email Change Verification',
            `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:30px;border-radius:10px;border:1px solid #e5e7eb;">
                <h2 style="color:#ec4899;">Email Change Request</h2>
                <p>Someone requested to change your account email. Your verification code is:</p>
                <div style="font-size:2.5rem;font-weight:bold;letter-spacing:10px;color:#1f2937;background:#f3f4f6;padding:20px;border-radius:8px;text-align:center;">${otp}</div>
                <p style="color:#6b7280;margin-top:20px;font-size:0.9rem;">If this wasn't you, please ignore this email and your account will remain safe.</p>
            </div>`
        );

        res.json({ success: true });
    } catch (error) {
        console.error(error.response?.data || error.message);
        res.status(500).json({ error: 'Failed to send OTP' });
    }
});

// ===== DASHBOARD: Verify OTP & Update Email =====
app.post('/api/auth/verify-change-email-otp', verifyToken, async (req, res) => {
    try {
        const { otp, newEmail } = req.body;
        const stored = otpStore['change_' + req.userId];

        if (!stored) return res.status(400).json({ error: 'OTP expired' });
        if (Date.now() > stored.expiresAt) { delete otpStore['change_' + req.userId]; return res.status(400).json({ error: 'OTP expired' }); }
        if (stored.otp !== otp) return res.status(400).json({ error: 'Invalid OTP' });

        await pool.query('UPDATE users SET email = $1 WHERE id = $2', [newEmail, req.userId]);
        delete otpStore['change_' + req.userId];

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update email' });
    }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ ContactKar Server v2.0 running on ${PORT}`));
