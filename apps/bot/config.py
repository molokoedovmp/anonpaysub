import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()

@dataclass
class Settings:
    bot_token: str
    admin_chat_id: str  # allow @channelusername or numeric id
    webapp_url: str
    start_card_image_url: str | None
    payments_base_url: str
    support_url: str | None
    privacy_url: str


def get_settings() -> Settings:
    token = os.getenv("BOT_TOKEN", "")
    admin = os.getenv("ADMIN_CHAT_ID", "").strip()
    webapp = os.getenv("NEXT_PUBLIC_WEBAPP_URL", "http://localhost:3000/tg")
    start_image = os.getenv("START_CARD_IMAGE_URL") or None
    payments_base = (os.getenv("PAYMENTS_API_BASE", "http://localhost:3000").rstrip('/'))
    # Support link: explicit SUPPORT_URL or derive from @username in ADMIN_CHAT_ID
    support_env = os.getenv("SUPPORT_URL", "").strip()
    # При отсутствии явного SUPPORT_URL пытаемся построить из @username,
    # иначе используем дефолт на @aibazaru
    support_url = support_env or (f"https://t.me/{admin[1:]}" if admin.startswith('@') else "https://t.me/aibazaru")
    # Privacy URL: explicit PRIVACY_URL or derive from webapp base
    from urllib.parse import urlsplit
    ws = urlsplit(webapp)
    base = f"{ws.scheme}://{ws.netloc}" if ws.scheme and ws.netloc else payments_base
    privacy_url = os.getenv("PRIVACY_URL", "").strip() or f"{base}/privacy"
    if not token:
        raise RuntimeError("BOT_TOKEN is required")
    if not admin:
        raise RuntimeError("ADMIN_CHAT_ID is required")
    # Keep as string; Telegram supports @channelusername, numeric ids for users/chats
    return Settings(
        bot_token=token,
        admin_chat_id=admin,
        webapp_url=webapp,
        start_card_image_url=start_image,
        payments_base_url=payments_base,
        support_url=support_url,
        privacy_url=privacy_url,
    )
