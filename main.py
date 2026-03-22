import os
import sqlite3
import logging
import asyncio
from dotenv import load_dotenv
from datetime import datetime
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import CommandStart, Command
from aiogram.utils.keyboard import InlineKeyboardBuilder
from aiogram.types import WebAppInfo

load_dotenv()

# --- Configuration ---
TOKEN = os.getenv("BOT_TOKEN")
DATABASE = "database.db"
ADMIN_ID = os.getenv("ADMIN_ID") # Optional for admin broadcasts
DB_PATH = os.path.abspath(DATABASE)

logging.basicConfig(level=logging.INFO)
bot = Bot(token=TOKEN)
dp = Dispatcher()

# --- Database Helpers ---
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_user(user_id, username, referred_by=None):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE id = ?", (str(user_id),))
    user = cursor.fetchone()
    
    if not user:
        cursor.execute(
            "INSERT INTO users (id, username, referred_by, balance, stars_balance) VALUES (?, ?, ?, 0, 0)",
            (str(user_id), username, referred_by)
        )
        if referred_by:
            # Reward the referrer
            cursor.execute("UPDATE users SET stars_balance = stars_balance + 1 WHERE id = ?", (referred_by,))
            # TODO: Send notification to referrer if possible
        conn.commit()
    conn.close()

REQUIRED_CHANNEL = "@starsbazachannel"

# --- Middleware/Helper: Check Channel Subscription ---
async def check_subscription(user_id: int):
    try:
        member = await bot.get_chat_member(chat_id=REQUIRED_CHANNEL, user_id=user_id)
        if member.status in ["member", "administrator", "creator"]:
            return True
    except Exception as e:
        logging.error(f"Subscription check error: {e}")
    return False

def get_join_keyboard():
    kb = InlineKeyboardBuilder()
    kb.button(text="Kanalga a'zo bo'lish 📢", url="https://t.me/starsbazachannel")
    kb.button(text="Tekshirish ✅", callback_data="check_sub")
    kb.adjust(1)
    return kb.as_markup()

# --- Handlers ---
@dp.message(CommandStart())
async def start_cmd(message: types.Message):
    user_id = str(message.from_user.id)
    username = message.from_user.username or "NoUsername"
    
    # Check for referral in args (/start ref123)
    args = message.text.split()
    referred_by = args[1] if len(args) > 1 else None

    conn = get_db()
    cursor = conn.cursor()
    
    # 1. Check if user exists
    cursor.execute("SELECT id FROM users WHERE id = ?", (user_id,))
    exists = cursor.fetchone()
    
    if not exists:
        # 2. Add new user
        cursor.execute(
            "INSERT INTO users (id, username, balance, total_orders, total_stars, joined_at, referred_by, stars_balance) VALUES (?, ?, 0, 0, 0, ?, ?, 0)",
            (user_id, username, datetime.now(), referred_by)
        )
        
        # 3. Reward referrer (+1 Star)
        if referred_by and referred_by != user_id:
            cursor.execute("UPDATE users SET stars_balance = stars_balance + 1 WHERE id = ?", (referred_by,))
            try:
                await bot.send_message(referred_by, f"🎉 Yangi referal! Sizga +1 Star 💎 berildi.")
            except: pass
        
        conn.commit()
    # Check Subscription
    if not await check_subscription(message.from_user.id):
        await message.answer(
            "⚠️ Botdan foydalanish uchun kanalimizga a'zo bo'lishingiz kerak!",
            reply_markup=get_join_keyboard()
        )
        return

    # Web App Button
    kb = InlineKeyboardBuilder()
    kb.button(text="Web Appni ochish 🚀", web_app=WebAppInfo(url=f"https://buyurtma-production.up.railway.app/?user_id={user_id}")) # LOCAL TESTING: http://localhost:3000
    kb.button(text="Balans 💰", callback_data="check_balance")
    kb.button(text="Referal Havola 👥", callback_data="get_ref")
    kb.button(text="Promo Kod 🎁", callback_data="enter_promo")
    kb.adjust(1, 2)

    await message.answer(
        f"<b>Salom {message.from_user.full_name}!</b> 👋\n\n"
        "✨ <b>STARS BAZA</b> botiga xush kelibsiz!\n\n"
        "Bu yerda siz:\n"
        "💎 <b>Telegram Stars</b> - Eng arzon narxlarda\n"
        "👑 <b>Telegram Premium</b> - Tezkor va ishonchli\n"
        "💰 <b>Referal tizimi</b> - Har bir do'st uchun pul ishlang\n\n"
        "Pastdagi tugma orqali <b>Web App</b>ni oching va xaridni boshlang!",
        reply_markup=kb.as_markup(),
        parse_mode="HTML"
    )

@dp.callback_query(F.data == "check_balance")
async def check_balance(callback: types.CallbackQuery):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT balance, stars_balance FROM users WHERE id = ?", (str(callback.from_user.id),))
    res = cursor.fetchone()
    conn.close()
    
    if res:
        balance, stars = res['balance'], res['stars_balance']
        formatted_balance = "{:,}".format(balance).replace(",", " ")
        await callback.message.answer(
            f"<b>💳 Sizning balansingiz:</b>\n\n"
            f"💰 Asosiy: <b>{formatted_balance} so'm</b>\n"
            f"💎 Stars: <b>{stars} ta</b>",
            parse_mode="HTML"
        )
    else:
        await callback.answer("Foydalanuvchi topilmadi.")
    await callback.answer()

@dp.callback_query(F.data == "get_ref")
async def get_ref(callback: types.CallbackQuery):
    user_id = str(callback.from_user.id)
    bot_username = (await bot.get_me()).username # Get bot's actual username
    ref_link = f"https://t.me/{bot_username}?start={user_id}"
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM users WHERE referred_by = ?", (user_id,))
    count = cursor.fetchone()[0]
    conn.close()

    await callback.message.answer(
        f"💎 Referal tizimi\n\n"
        f"Do'stingizni taklif qiling va har biriga +1 Star 💎 oling!\n\n"
        f"🔗 Sizning havolangiz: `{ref_link}`\n"
        f"👥 Hammasi bo'lib: {count} ta referal",
        parse_mode="Markdown"
    )
    await callback.answer()

@dp.callback_query(F.data == "check_sub")
async def cb_check_sub(callback: types.CallbackQuery):
    if await check_subscription(callback.from_user.id):
        await callback.message.edit_text("✅ Rahmat! Endi botdan foydalanishingiz mumkin.")
        await start_cmd(callback.message) # Re-run start
    else:
        await callback.answer("❌ Siz hali ham kanalga a'zo emassiz!", show_alert=True)

@dp.callback_query(F.data == "enter_promo")
async def cb_promo(callback: types.CallbackQuery):
    await callback.answer()
    await callback.message.answer("🎁 Promo kodni yuboring:")

@dp.message()
async def promo_handler(message: types.Message):
    # If the user sends a potential promo code (not a command)
    if message.text and not message.text.startswith('/'):
        code = message.text.strip()
        # Proxy to the local API or handle directly via DB
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM promo_codes WHERE code = ?", (code,))
        promo = cursor.fetchone()
        
        if not promo:
            await message.answer("❌ Bunday promo kod mavjud emas.")
            conn.close()
            return
            
        if promo['current_uses'] >= promo['max_uses']:
            await message.answer("❌ Bu promo kodning ishlatilish soni tugagan.")
            conn.close()
            return
            
        cursor.execute("SELECT * FROM promo_usage WHERE user_id = ? AND promo_id = ?", (str(message.from_user.id), promo['id']))
        if cursor.fetchone():
            await message.answer("❌ Siz bu promo kodni allaqachon ishlatgansiz.")
            conn.close()
            return
            
        # All checks passed, reward the user
        reward = promo['reward']
        cursor.execute("UPDATE users SET stars_balance = stars_balance + ? WHERE id = ?", (reward, str(message.from_user.id)))
        cursor.execute("UPDATE promo_codes SET current_uses = current_uses + 1 WHERE id = ?", (promo['id'],))
        cursor.execute("INSERT INTO promo_usage (user_id, promo_id) VALUES (?, ?)", (str(message.from_user.id), promo['id']))
        conn.commit()
        conn.close()
        
        await message.answer(f"✅ Tabriklaymiz! Hisobingizga {reward} Stars 💎 qo'shildi.")

async def main():
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
