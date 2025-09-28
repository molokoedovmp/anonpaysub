import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()

@dataclass
class Settings:
    bot_token: str
    admin_chat_id: str  # allow @channelusername or numeric id
    webapp_url: str

def get_settings() -> Settings:
    token = os.getenv("BOT_TOKEN", "")
    admin = os.getenv("ADMIN_CHAT_ID", "").strip()
    webapp = os.getenv("NEXT_PUBLIC_WEBAPP_URL", "http://localhost:3000/tg")
    if not token:
        raise RuntimeError("BOT_TOKEN is required")
    if not admin:
        raise RuntimeError("ADMIN_CHAT_ID is required")
    # Keep as string; Telegram supports @channelusername, numeric ids for users/chats
    return Settings(bot_token=token, admin_chat_id=admin, webapp_url=webapp)
