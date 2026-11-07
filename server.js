const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
require('dotenv').config();

const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const SALT_ROUNDS = 10;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[0-9+\-\s()]{7,15}$/;
const ALLOWED_CATEGORIES = ['Family', 'Friends', 'College', 'Work', 'Other'];

// Middlewares
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MySQL Session Store
const sessionStore = new MySQLStore({
    clearExpired: true,
    checkExpirationInterval: 900000,
    expiration: 86400000,
    createDatabaseTable: true,
    schema: {
        tableName: 'sessions',
        columnNames: { session_id: 'session_id', expires: 'expires', data: 'data' }
    }
}, pool);

app.use(session({
    key: 'connect.sid',
    secret: process.env.SESSION_SECRET || 'sr_university_wtmp_team4_super_secret_key_2026',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'lax'
    }
}));

// Route Guard
function isAuthenticated(req, res, next) {
    if (req.session && req.session.userId) return next();
    return res.status(401).json({ success: false, message: 'Unauthorized. Please login.' });
}

// ==========================================
// AUTHENTICATION APIS
// ==========================================
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password, confirmPassword } = req.body;
        if (!name || !email || !password || !confirmPassword) {
            return res.status(400).json({ success: false, message: 'All fields are required.' });
        }
        const trimmedName = name.trim();
        const trimmedEmail = email.trim().toLowerCase();

        if (trimmedName.length < 2) return res.status(400).json({ success: false, message: 'Name must be at least 2 characters.' });
        if (!EMAIL_REGEX.test(trimmedEmail)) return res.status(400).json({ success: false, message: 'Valid email required.' });
        if (password.length < 6) return res.status(400).json({ success: false, message: 'Password min 6 chars.' });
        if (password !== confirmPassword) return res.status(400).json({ success: false, message: 'Passwords do not match.' });

        const [existing] = await pool.query('SELECT user_id FROM users WHERE email = ?', [trimmedEmail]);
        if (existing.length > 0) return res.status(409).json({ success: false, message: 'Email already registered.' });

        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
        const [result] = await pool.query('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', [trimmedName, trimmedEmail, hashedPassword]);

        return res.status(201).json({ success: true, message: 'Registration successful!', userId: result.insertId });
    } catch (err) {
        console.error('Registration error:', err);
        return res.status(500).json({ success: false, message: 'Server error during registration.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password required.' });

        const trimmedEmail = email.trim().toLowerCase();
        const [rows] = await pool.query('SELECT user_id, name, email, password FROM users WHERE email = ?', [trimmedEmail]);
        if (rows.length === 0) return res.status(401).json({ success: false, message: 'Invalid email or password.' });

        const user = rows[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ success: false, message: 'Invalid email or password.' });

        req.session.userId = user.user_id;
        req.session.userName = user.name;
        req.session.userEmail = user.email;

        return res.status(200).json({
            success: true,
            message: 'Login successful!',
            user: { id: user.user_id, name: user.name, email: user.email }
        });
    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ success: false, message: 'Server error during login.' });
    }
});

app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).json({ success: false, message: 'Logout failed.' });
        res.clearCookie('connect.sid');
        return res.status(200).json({ success: true, message: 'Logged out successfully.' });
    });
});

app.get('/api/auth/me', isAuthenticated, (req, res) => {
    return res.status(200).json({
        success: true,
        user: { id: req.session.userId, name: req.session.userName, email: req.session.userEmail }
    });
});

// ==========================================
// CONTACT MANAGEMENT APIS
// ==========================================
app.get('/api/contacts/stats', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.userId;
        const [totalRows] = await pool.query('SELECT COUNT(*) AS total FROM contacts WHERE user_id = ?', [userId]);
        const [favRows] = await pool.query('SELECT COUNT(*) AS total FROM contacts WHERE user_id = ? AND is_favorite = 1', [userId]);
        const [categoryRows] = await pool.query('SELECT category, COUNT(*) AS count FROM contacts WHERE user_id = ? GROUP BY category', [userId]);

        const categoryCounts = { Family: 0, Friends: 0, College: 0, Work: 0, Other: 0 };
        categoryRows.forEach(row => {
            if (categoryCounts.hasOwnProperty(row.category)) categoryCounts[row.category] = row.count;
            else categoryCounts.Other += row.count;
        });

        return res.status(200).json({
            success: true,
            stats: {
                totalContacts: totalRows[0].total,
                favoriteContacts: favRows[0].total,
                categories: categoryCounts
            }
        });
    } catch (err) {
        console.error('Stats error:', err);
        return res.status(500).json({ success: false, message: 'Failed to calculate stats.' });
    }
});

app.get('/api/contacts/export/csv', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.userId;
        const [contacts] = await pool.query('SELECT name, phone, email, category, address, notes, is_favorite, created_at FROM contacts WHERE user_id = ? ORDER BY name ASC', [userId]);

        const escapeVal = val => `"${String(val || '').replace(/"/g, '""')}"`;
        const headers = ['Full Name', 'Phone Number', 'Email', 'Category', 'Address', 'Notes', 'Is Favorite', 'Added On'];
        const csvRows = [headers.join(',')];

        contacts.forEach(c => {
            csvRows.push([
                escapeVal(c.name),
                escapeVal(c.phone),
                escapeVal(c.email),
                escapeVal(c.category || 'Other'),
                escapeVal(c.address),
                escapeVal(c.notes),
                escapeVal(c.is_favorite ? 'Yes' : 'No'),
                escapeVal(new Date(c.created_at).toISOString().split('T')[0])
            ].join(','));
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="contacts_${Date.now()}.csv"`);
        return res.status(200).send(csvRows.join('\r\n'));
    } catch (err) {
        console.error('CSV export error:', err);
        return res.status(500).json({ success: false, message: 'CSV export failed.' });
    }
});

app.get('/api/contacts', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.userId;
        const { category, favorite, search } = req.query;

        let query = 'SELECT * FROM contacts WHERE user_id = ?';
        const params = [userId];

        if (category && ALLOWED_CATEGORIES.includes(category)) {
            query += ' AND category = ?';
            params.push(category);
        }
        if (favorite === 'true' || favorite === '1') {
            query += ' AND is_favorite = 1';
        }
        if (search && search.trim()) {
            const term = `%${search.trim()}%`;
            query += ' AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)';
            params.push(term, term, term);
        }
        query += ' ORDER BY name ASC';

        const [contacts] = await pool.query(query, params);
        return res.status(200).json({ success: true, count: contacts.length, contacts });
    } catch (err) {
        console.error('Fetch contacts error:', err);
        return res.status(500).json({ success: false, message: 'Error fetching contacts.' });
    }
});

app.get('/api/contacts/:id', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.userId;
        const [rows] = await pool.query('SELECT * FROM contacts WHERE contact_id = ? AND user_id = ?', [req.params.id, userId]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Contact not found.' });
        return res.status(200).json({ success: true, contact: rows[0] });
    } catch (err) {
        console.error('Fetch contact error:', err);
        return res.status(500).json({ success: false, message: 'Error fetching contact.' });
    }
});

app.post('/api/contacts', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.userId;
        const { name, phone, email, address, category, notes, is_favorite } = req.body;

        if (!name || !name.trim()) return res.status(400).json({ success: false, message: 'Name is required.' });
        if (!phone || !phone.trim() || !PHONE_REGEX.test(phone.trim())) return res.status(400).json({ success: false, message: 'Valid phone required (7-15 digits).' });

        const trimmedEmail = email ? email.trim().toLowerCase() : null;
        if (trimmedEmail && !EMAIL_REGEX.test(trimmedEmail)) return res.status(400).json({ success: false, message: 'Valid email required.' });

        const finalCat = ALLOWED_CATEGORIES.includes(category) ? category : 'Other';
        const finalFav = (is_favorite === true || is_favorite === 1 || is_favorite === 'true') ? 1 : 0;

        const [result] = await pool.query(
            `INSERT INTO contacts (user_id, name, phone, email, address, category, notes, is_favorite)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, name.trim(), phone.trim(), trimmedEmail, address ? address.trim() : null, finalCat, notes ? notes.trim() : null, finalFav]
        );

        return res.status(201).json({ success: true, message: 'Contact created successfully!', contactId: result.insertId });
    } catch (err) {
        console.error('Create contact error:', err);
        return res.status(500).json({ success: false, message: 'Error creating contact.' });
    }
});

app.put('/api/contacts/:id', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.userId;
        const contactId = req.params.id;
        const { name, phone, email, address, category, notes, is_favorite } = req.body;

        const [check] = await pool.query('SELECT contact_id FROM contacts WHERE contact_id = ? AND user_id = ?', [contactId, userId]);
        if (check.length === 0) return res.status(404).json({ success: false, message: 'Contact not found.' });

        if (!name || !name.trim()) return res.status(400).json({ success: false, message: 'Name cannot be empty.' });
        if (!phone || !phone.trim() || !PHONE_REGEX.test(phone.trim())) return res.status(400).json({ success: false, message: 'Valid phone required.' });

        const trimmedEmail = email ? email.trim().toLowerCase() : null;
        if (trimmedEmail && !EMAIL_REGEX.test(trimmedEmail)) return res.status(400).json({ success: false, message: 'Valid email required.' });

        const finalCat = ALLOWED_CATEGORIES.includes(category) ? category : 'Other';
        const finalFav = (is_favorite === true || is_favorite === 1 || is_favorite === 'true') ? 1 : 0;

        await pool.query(
            `UPDATE contacts SET name = ?, phone = ?, email = ?, address = ?, category = ?, notes = ?, is_favorite = ?
             WHERE contact_id = ? AND user_id = ?`,
            [name.trim(), phone.trim(), trimmedEmail, address ? address.trim() : null, finalCat, notes ? notes.trim() : null, finalFav, contactId, userId]
        );

        return res.status(200).json({ success: true, message: 'Contact updated successfully!' });
    } catch (err) {
        console.error('Update contact error:', err);
        return res.status(500).json({ success: false, message: 'Error updating contact.' });
    }
});

app.patch('/api/contacts/:id/favorite', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.userId;
        const [rows] = await pool.query('SELECT is_favorite FROM contacts WHERE contact_id = ? AND user_id = ?', [req.params.id, userId]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Contact not found.' });

        const newState = rows[0].is_favorite ? 0 : 1;
        await pool.query('UPDATE contacts SET is_favorite = ? WHERE contact_id = ? AND user_id = ?', [newState, req.params.id, userId]);

        return res.status(200).json({
            success: true,
            message: newState ? 'Added to favorites.' : 'Removed from favorites.',
            is_favorite: Boolean(newState)
        });
    } catch (err) {
        console.error('Toggle favorite error:', err);
        return res.status(500).json({ success: false, message: 'Error toggling favorite.' });
    }
});

app.delete('/api/contacts/:id', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.userId;
        const [result] = await pool.query('DELETE FROM contacts WHERE contact_id = ? AND user_id = ?', [req.params.id, userId]);
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Contact not found.' });

        return res.status(200).json({ success: true, message: 'Contact deleted successfully.' });
    } catch (err) {
        console.error('Delete error:', err);
        return res.status(500).json({ success: false, message: 'Error deleting contact.' });
    }
});

// ==========================================
// STATIC FRONTEND SERVING (Flat Root)
// ==========================================
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    if (req.session && req.session.userId) {
        return res.sendFile(path.join(__dirname, 'index.html'));
    }
    return res.sendFile(path.join(__dirname, 'login.html'));
});

app.use((req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ success: false, message: 'API not found.' });
    return res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`Flat Deployment Running on: http://localhost:${PORT}`);
    console.log(`=======================================================`);
});
