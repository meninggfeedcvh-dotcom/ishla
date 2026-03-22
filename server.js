const express = require('express');
const path = require('path');
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

app.get('/api/history', (req, res) => {
    const userId = req.query.user_id;
    if (!userId) return res.json([]);

    db.all("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC", [userId], (err, rows) => {
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
    db.all("SELECT username, total_stars as stars, total_orders as orders FROM users ORDER BY total_stars DESC LIMIT 10", [], (err, rows) => {
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
    
    db.get("SELECT balance FROM users WHERE id = ?", [user_id], (err, row) => {
        if (err || !row) return res.status(404).json({ error: "User not found" });
        if (row.balance < price) return res.status(400).json({ error: "Mablag' yetarli emas" });

        db.run("UPDATE users SET balance = balance - ? WHERE id = ?", [price, user_id], function(err) {
            if (err) return res.status(500).json({ error: "Transaction failed" });
            
            db.run(
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

app.listen(port, '0.0.0.0', () => {
    console.log(`Server is listening on port ${port} and address 0.0.0.0`);
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
