const express = require('express');
const path = require('path');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 3000;
const { Pool } = require('pg');

// --- Database Connection Config ---
let db;
const isPostgres = process.env.DATABASE_URL !== undefined;

if (isPostgres) {
    db = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    console.log('Connected to PostgreSQL database');
} else {
    try {
        const sqlite3 = require('sqlite3').verbose();
        db = new sqlite3.Database('database.db');
        console.log('Connected to SQLite database');
        
        // --- Database Schema Extensions ---
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT,
                balance INTEGER DEFAULT 0,
                total_orders INTEGER DEFAULT 0,
                total_stars INTEGER DEFAULT 0,
                joined_at DATETIME,
                referred_by TEXT,
                stars_balance INTEGER DEFAULT 0
            )`);
            
            db.all("PRAGMA table_info(users)", (err, rows) => {
                if (err) return;
                const cols = rows.map(r => r.name);
                if (!cols.includes('joined_at')) db.run("ALTER TABLE users ADD COLUMN joined_at DATETIME");
                if (!cols.includes('referred_by')) db.run("ALTER TABLE users ADD COLUMN referred_by TEXT");
                if (!cols.includes('stars_balance')) db.run("ALTER TABLE users ADD COLUMN stars_balance INTEGER DEFAULT 0");
            });

            db.run(`CREATE TABLE IF NOT EXISTS promo_codes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT UNIQUE,
                reward INTEGER,
                max_uses INTEGER,
                current_uses INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS promo_usage (
                user_id TEXT,
                promo_id INTEGER,
                used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, promo_id)
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS withdrawals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT,
                amount INTEGER,
                status TEXT DEFAULT 'pending',
                wallet_address TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )`);

            db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('required_channel', '@starsbazachannel')`);
        });
    } catch (e) {
        console.error('SQLite initialization failed:', e.message);
    }
}

// Wrapper to match SQLite/Postgres query styles
const query = {
    get: (sql, params, cb) => {
        if (isPostgres) {
            db.query(sql.replace(/\?/g, (m, i) => `$${i + 1}`), params, (err, res) => cb(err, res ? res.rows[0] : null));
        } else {
            db.get(sql, params, cb);
        }
    },
    all: (sql, params, cb) => {
        if (isPostgres) {
            db.query(sql.replace(/\?/g, (m, i) => `$${i + 1}`), params, (err, res) => cb(err, res ? res.rows : []));
        } else {
            db.all(sql, params, cb);
        }
    },
    run: (sql, params, cb) => {
        if (isPostgres) {
            db.query(sql.replace(/\?/g, (m, i) => `$${i + 1}`), params, (err) => cb(err));
        } else {
            db.run(sql, params, cb);
        }
    }
};

// --- Global Error Handling ---
process.on('uncaughtException', (err) => {
    console.error('CRITICAL UNCAUGHT EXCEPTION:', err);
    // Keep server running if possible, but log it
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED REJECTION:', reason);
});



const topData = {
    daily: [
        { name: "User 1", orders: 12, stars: 15400, avatar: "❤️" },
        { name: "User 2", orders: 10, stars: 12000, avatar: "2" },
    ],
    weekly: [
        { name: "❤️❤️❤️", orders: 1, stars: 1400, avatar: "❤️" },
        { name: "Хокимбоевна", orders: 4, stars: 910, avatar: "2" },
        { name: "nuzbiy", orders: 11, stars: 881, avatar: "3" },
        { name: "Nuriddinovc.", orders: 7, stars: 750, avatar: "4" },
        { name: "Nurbek", orders: 2, stars: 750, avatar: "5" },
        { name: "Alibek", orders: 5, stars: 732, avatar: "6" },
        { name: "Jasur", orders: 3, stars: 600, avatar: "7" },
        { name: "Sardor", orders: 8, stars: 550, avatar: "8" },
        { name: "Bekzod", orders: 6, stars: 500, avatar: "9" },
        { name: "Diyor", orders: 9, stars: 450, avatar: "10" }
    ],
    monthly: [
        { name: "Monthly King", orders: 50, stars: 100000, avatar: "👑" }
    ],
    all: [
        { name: "Legend", orders: 500, stars: 1000000, avatar: "⭐" }
    ]
};

app.use(express.json());

app.get('/api/user', (req, res) => {
    const userId = req.query.user_id;
    if (!userId) {
        return res.json({
            balance: 0,
            username: 'Mehmon',
            id: 'n/a',
            currency: 'so\'m',
            avatar_letter: '?',
            stats: { orders: 0, stars: 0, referrals: 0 },
            api_token: 'sk-stars-guest'
        });
    }

    query.get(`
        SELECT u.*, 
        (SELECT COUNT(*) FROM users WHERE referred_by = u.id) as ref_count
        FROM users u WHERE u.id = ?
    `, [userId], (err, row) => {
        if (err || !row) {
            return res.json({
                balance: 0,
                stars_balance: 0,
                username: 'Noma\'lum',
                id: userId,
                currency: 'so\'m',
                avatar_letter: '!',
                stats: { orders: 0, stars: 0, referrals: 0 },
                api_token: `sk-stars-${userId}`
            });
        }
        res.json({
            balance: row.balance,
            stars_balance: row.stars_balance || 0,
            username: `@${row.username}`,
            id: row.id,
            currency: 'so\'m',
            avatar_letter: row.username ? row.username[0].toUpperCase() : '?',
            stats: {
                orders: row.total_orders,
                stars: row.total_stars,
                referrals: row.ref_count
            },
            api_token: `sk-stars-${row.id}`
        });
    });
});

// --- Bot Feature Endpoints ---
app.post('/api/withdraw', (req, res) => {
    const { user_id, amount, wallet } = req.body;
    query.get("SELECT stars_balance FROM users WHERE id = ?", [user_id], (err, row) => {
        if (err || !row || row.stars_balance < amount || amount < 50) 
            return res.status(400).json({ error: "Xatolik yoki yetarli emas" });

        query.run("UPDATE users SET stars_balance = stars_balance - ? WHERE id = ?", [amount, user_id], () => {
            query.run("INSERT INTO withdrawals (user_id, amount, wallet_address) VALUES (?, ?, ?)", [user_id, amount, wallet], () => {
                res.json({ success: true });
            });
        });
    });
});

app.post('/api/promo/redeem', (req, res) => {
    const { user_id, code } = req.body;
    query.get("SELECT * FROM promo_codes WHERE code = ?", [code], (err, promo) => {
        if (!promo || promo.current_uses >= promo.max_uses) return res.status(400).json({ error: "Promo xato yoki tugagan" });
        query.get("SELECT * FROM promo_usage WHERE user_id = ? AND promo_id = ?", [user_id, promo.id], (err, used) => {
            if (used) return res.status(400).json({ error: "Avval ishlatilgan" });
            query.run("UPDATE users SET stars_balance = stars_balance + ? WHERE id = ?", [promo.reward, user_id], () => {
                query.run("UPDATE promo_codes SET current_uses = current_uses + 1 WHERE id = ?", [promo.id], () => {
                    query.run("INSERT INTO promo_usage (user_id, promo_id) VALUES (?, ?)", [user_id, promo.id], () => {
                        res.json({ success: true, reward: promo.reward });
                    });
                });
            });
        });
    });
});

app.get('/api/history', (req, res) => {
    const userId = req.query.user_id;
    if (!userId) return res.json([]);

    query.all("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC", [userId], (err, rows) => {
        if (err) return res.json([]);
        const formatted = rows.map(r => ({
            title: r.type,
            date: r.created_at,
            status: r.status,
            amount: r.amount,
            price: r.price + ' so\'m'
        }));
        res.json(formatted);
    });
});

app.get('/api/top10', (req, res) => {
    query.all("SELECT username, total_stars as stars, total_orders as orders FROM users ORDER BY total_stars DESC LIMIT 10", [], (err, rows) => {
        if (err) return res.json([]);
        const formatted = rows.map(r => ({
            name: r.username ? `@${r.username}` : 'User',
            orders: r.orders,
            stars: r.stars,
            avatar: r.username ? r.username[0].toUpperCase() : '?'
        }));
        res.json(formatted);
    });
});

app.post('/api/purchase', (req, res) => {
    const { user_id, type, target_user, amount, price } = req.body;
    
    query.get("SELECT balance FROM users WHERE id = ?", [user_id], (err, row) => {
        if (err || !row) return res.status(404).json({ error: "User not found" });
        if (row.balance < price) return res.status(400).json({ error: "Mablag' yetarli emas" });

        query.run("UPDATE users SET balance = balance - ? WHERE id = ?", [price, user_id], function(err) {
            if (err) return res.status(500).json({ error: "Transaction failed" });
            
            query.run(
                "INSERT INTO orders (user_id, type, target_user, amount, price) VALUES (?, ?, ?, ?, ?)",
                [user_id, type, target_user, amount, price],
                function(err) {
                    if (err) return res.status(500).json({ error: "Order recording failed" });
                    res.json({ success: true, new_balance: row.balance - price });
                }
            );
        });
    });
});

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

app.use(express.static(path.join(__dirname, '/')));

app.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
});

// --- Graceful Shutdown ---
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    db.close((err) => {
        if (err) console.error('Error closing database:', err.message);
        else console.log('Database connection closed.');
        process.exit(0);
    });
});
