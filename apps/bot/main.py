import asyncio
from aiogram import Bot, Dispatcher, F
from aiogram.filters import Command, CommandStart
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    Message,
    ReplyKeyboardMarkup,
    WebAppInfo,
)
from config import get_settings


def is_https(url: str) -> bool:
    return url.strip().lower().startswith("https://")


def build_webapp_keyboard(url: str) -> ReplyKeyboardMarkup | None:
    if not is_https(url):
        return None
    return ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text="Открыть мини‑приложение", web_app=WebAppInfo(url=url))]],
        resize_keyboard=True
    )


def build_link_markup(url: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text="Открыть мини‑приложение", url=url)]]
    )


async def main():
    settings = get_settings()
    bot = Bot(settings.bot_token)
    dp = Dispatcher()

    @dp.message(CommandStart())
    async def start(m: Message):
        kb = build_webapp_keyboard(settings.webapp_url)
        text = (
            "Привет! Нажмите кнопку ниже, чтобы открыть мини‑приложение.\n"
            f"Прямая ссылка: {settings.webapp_url}"
        )
        if kb:
            await m.answer(text, reply_markup=kb)
        else:
            warn = (
                text
                + "\n\nТребуется HTTPS‑ссылка для WebApp. Укажите публичный домен в BotFather и в переменной NEXT_PUBLIC_WEBAPP_URL."
            )
            await m.answer(warn, reply_markup=build_link_markup(settings.webapp_url))

    @dp.message(Command("help"))
    async def help_cmd(m: Message):
        kb = build_webapp_keyboard(settings.webapp_url)
        text = (
            "Откройте мини‑приложение ниже. Внутри вы укажете сервис, логин и пароль, выберете срок (включая 9 месяцев) и увидите расчёт итоговой стоимости в RUB."
        )
        if kb:
            await m.answer(text, reply_markup=kb)
        else:
            await m.answer(
                text + f"\n\nПрямая ссылка: {settings.webapp_url}",
                reply_markup=build_link_markup(settings.webapp_url)
            )

    @dp.message(F.text.lower().in_({"webapp", "open"}))
    async def open_webapp(m: Message):
        kb = build_webapp_keyboard(settings.webapp_url)
        if kb:
            await m.answer("Откройте мини‑приложение:", reply_markup=kb)
        else:
            await m.answer(
                f"Откройте мини‑приложение по ссылке: {settings.webapp_url}",
                reply_markup=build_link_markup(settings.webapp_url)
            )

    @dp.message()
    async def any_text(m: Message):
        kb = build_webapp_keyboard(settings.webapp_url)
        if kb:
            await m.answer("Откройте мини‑приложение:", reply_markup=kb)
        else:
            await m.answer(
                f"Откройте мини‑приложение по ссылке: {settings.webapp_url}",
                reply_markup=build_link_markup(settings.webapp_url)
            )

    await dp.start_polling(bot)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        pass
