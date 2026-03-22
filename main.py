import asyncio
import logging
import sqlite3
import sys
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command
from aiogram.utils.keyboard import InlineKeyboardBuilder, ReplyKeyboardBuilder
from aiogram.types import WebAppInfo

# Configure logging
logging.basicConfig(level=logging.INFO)

import os
# --- Configuration ---
TOKEN = os.getenv("BOT_TOKEN", "8622545801:AAEZfQjdqtxzMpVnTfNhJr6pWBDIWlKRu-g")
ADMIN_IDS = [int(i) for i in os.getenv("ADMIN_IDS", "8534196478").split(",")]
DB_PATH = os.getenv("DB_PATH", "database.db")
WEBAPP_URL = os.getenv("WEBAPP_URL", "http://localhost:3000")

# --- Database ---
def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    # Users table with stats and admin role
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            username TEXT,
            full_name TEXT,
            balance INTEGER DEFAULT 100000, -- Default gift balance
            total_stars INTEGER DEFAULT 0,
            total_orders INTEGER DEFAULT 0,
            is_admin BOOLEAN DEFAULT 0,
            referred_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    # Orders table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            type TEXT,
            target_user TEXT,
            amount TEXT,
            price INTEGER,
            status TEXT DEFAULT 'Pending', -- Pending, Accepted, Rejected
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    ''')
    # Set initial admin
    for admin_id in ADMIN_IDS:
        cursor.execute("UPDATE users SET is_admin = 1 WHERE id = ?", (admin_id,))
    conn.commit()
    conn.close()

# --- Bot Handlers ---
bot = Bot(token=TOKEN)
dp = Dispatcher()

@dp.message(Command("admin"))
async def cmd_admin(message: types.Message):
    if message.from_user.id not in ADMIN_IDS:
        return await message.answer("Siz admin emassiz! ❌")
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM users")
    total_users = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM orders WHERE status = 'Pending'")
    pending_orders = cursor.fetchone()[0]
    conn.close()
    
    text = (
        "📈 *Admin Panel*\n\n"
        f"👥 Jami foydalanuvchilar: {total_users}\n"
        f"⏳ Kutilayotgan buyurtmalar: {pending_orders}\n\n"
        "Yangi buyurtmalarni ko'rish uchun /orders komandasini yozing."
    )
    await message.answer(text, parse_mode="Markdown")

@dp.message(Command("orders"))
async def cmd_orders(message: types.Message):
    if message.from_user.id not in ADMIN_IDS: return
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM orders WHERE status = 'Pending' LIMIT 10")
    orders = cursor.fetchall()
    conn.close()
    
    if not orders:
        return await message.answer("Kutilayotgan buyurtmalar yo'q. ✅")
    
    for order in orders:
        builder = InlineKeyboardBuilder()
        builder.row(
            types.InlineKeyboardButton(text="Qabul ✅", callback_data=f"order_accept_{order[0]}"),
            types.InlineKeyboardButton(text="Rad ❌", callback_data=f"order_reject_{order[0]}")
        )
        text = (
            f"📦 *Buyurtma #{order[0]}*\n"
            f"👤 User: {order[1]}\n"
            f"🏷 Tur: {order[2]}\n"
            f"🎯 Target: @{order[3]}\n"
            f"💎 Miqdor: {order[4]}\n"
            f"💰 Narx: {order[5]} so'm"
        )
        await message.answer(text, parse_mode="Markdown", reply_markup=builder.as_markup())

@dp.callback_query(F.data.startswith("order_"))
async def handle_callback(callback: types.CallbackQuery):
    if callback.from_user.id not in ADMIN_IDS: return
    
    action, _, order_id = callback.data.split("_")[1:], callback.data.split("_")[-2], callback.data.split("_")[-1]
    # Wait, simple split
    parts = callback.data.split("_")
    action = parts[1]
    order_id = parts[2]
    
    status = "Accepted" if action == "accept" else "Rejected"
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("UPDATE orders SET status = ? WHERE id = ?", (status, order_id))
    cursor.execute("SELECT user_id, type, amount FROM orders WHERE id = ?", (order_id,))
    user_id, o_type, o_amount = cursor.fetchone()
    
    if status == "Accepted":
        # Update user total stats
        import re
        try:
            match = re.search(r'\d+', o_amount)
            numeric_amount = int(match.group()) if match else 0
        except:
            numeric_amount = 0

        if "stars" in o_type.lower():
            cursor.execute("UPDATE users SET total_stars = total_stars + ?, total_orders = total_orders + 1 WHERE id = ?", (numeric_amount, user_id))
        else:
            cursor.execute("UPDATE users SET total_orders = total_orders + 1 WHERE id = ?", (user_id,))
            
    conn.commit()
    conn.close()
    
    await callback.message.edit_text(f"Buyurtma #{order_id} {status.lower()} qilindi. ✅")
    await bot.send_message(user_id, f"Sizning buyurtmangiz #{order_id} {status.lower()} qilindi! 🚀")

@dp.message(Command("start"))
async def cmd_start(message: types.Message):
    user_id = message.from_user.id
    username = message.from_user.username or "Unknown"
    full_name = message.from_user.full_name
    
    # Check for referral parameter
    args = message.text.split()
    referrer_id = None
    if len(args) > 1 and args[1].isdigit():
        referrer_id = int(args[1])
        if referrer_id == user_id: referrer_id = None # Can't refer self
    
    # Save user to DB
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM users WHERE id = ?", (user_id,))
    existing_user = cursor.fetchone()
    
    if not existing_user:
        cursor.execute(
            "INSERT INTO users (id, username, full_name, referred_by) VALUES (?, ?, ?, ?)",
            (user_id, username, full_name, referrer_id)
        )
        conn.commit()
        logging.info(f"New user registered: {user_id} (@{username})")
    
    conn.close()
    
    welcome_text = (
        f"Salom, {full_name}! 👋\n\n"
        "Stars Baza botiga xush kelibsiz. Bu bot orqali siz Telegram Stars va "
        "Premium obunalarni qulay va arzon narxlarda sotib olishingiz mumkin.\n\n"
        "Web Appga o'tish uchun bosing: \n"
        f"{WEBAPP_URL}?user_id={user_id}"
    )
    
    # Reply Keyboard with Web App buttons
    keyboard = ReplyKeyboardBuilder()
    keyboard.row(
        types.KeyboardButton(text="💎 Stars buyurtma berish", web_app=WebAppInfo(url=WEBAPP_URL)),
    )
    keyboard.row(
        types.KeyboardButton(text="💳 Hisob to'ldirish", web_app=WebAppInfo(url=f"{WEBAPP_URL}?tab=deposit")),
        types.KeyboardButton(text="📜 Mening tarixim", web_app=WebAppInfo(url=f"{WEBAPP_URL}?tab=history"))
    )
    
    await message.answer(
        welcome_text, 
        reply_markup=keyboard.as_markup(resize_keyboard=True)
    )

async def main():
    init_db()
    logging.info("Starting bot...")
    await dp.start_polling(bot)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        sys.exit(0)
