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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ ContactKar Server v2.0 running on ${PORT}`));
