# OnlyFansBot Monorepo (Telegram Bot + Mini App)

This repo contains:
- `apps/web`: Next.js 14 App Router mini‑app to run inside Telegram as a Web App (Mini App). Users select a service, enter order details, and submit an order. The API verifies Telegram WebApp `initData` and forwards the order to the admin via the bot.
- `apps/bot`: Python (aiogram 3) Telegram bot that sends the WebApp button and basic commands.
- `docker-compose.yml`: Local dev orchestrator.

Important: Do NOT collect user passwords for third‑party services. Prefer OAuth or instructions to authorize without credentials. If you must, encrypt on the client and never log/store plaintext. See Security notes below.

## Stack
- Frontend/API: Next.js 14 (App Router, TypeScript)
- Bot: Python 3.11+, aiogram 3
- Transport: Telegram Web App (Mini App) + Telegram Bot API

## Features (scaffolded)
- Launch mini app via Telegram `WebApp` button
- Render service selection + order details
- Verify Telegram `initData` HMAC in API using `BOT_TOKEN`
- Forward orders to `ADMIN_CHAT_ID` via Telegram sendMessage
- Pluggable payment provider stub (e.g., Crypto Pay, TON, USDT). Not implemented — replace stub with your provider.

## Quick start (dev)
1. Copy env
   - `cp .env.example .env`
   - `cp apps/web/.env.example apps/web/.env.local`
   - `cp apps/bot/.env.example apps/bot/.env`
2. Fill these vars:
   - `BOT_TOKEN`: BotFather token
   - `ADMIN_CHAT_ID`: Your Telegram ID or target chat ID
   - `NEXT_PUBLIC_WEBAPP_URL`: Public URL for the mini app (e.g., `https://your-host/tg` in prod; `http://localhost:3000/tg` for local)
   - `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`: `@your_bot`
   - `ALLOW_DEV_NO_INITDATA=1` (optional) — разрешает оформлять заказы при тестировании вне Telegram WebApp (для `localhost` эта опция включается автоматически)
3. Run locally
   - With Docker: `docker compose up --build`
   - Or manually:
     - Web: `cd apps/web && npm i && npm run dev`
     - Bot: `cd apps/bot && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && python main.py`

## Telegram setup
- Create bot in BotFather
- Set Web App domain in BotFather (required to open mini app). Telegram принимает только HTTPS ссылки — используйте свой домен или, для тестов, туннель вроде `https://<subdomain>.ngrok.io/tg`.
- Optional: Configure deep-link domain and privacy settings

## Security notes
- WebApp request verification: API verifies `initData` HMAC per Telegram docs using `BOT_TOKEN`.
- Never log or store sensitive credentials. Prefer OAuth or non-credential flows.
- If handling payments, use a provider that does not leak PII. Telegram Crypto Pay or TON are common for anonymous flows. Integrate in `apps/web/lib/payments`.

## Production deployment (HTTPS domain)
1. DNS
   - Создайте A-записи `@` и `www` на IP вашего сервера (у вас уже указано `31.31.197.38`).
   - Если используете IPv6, пропишите AAAA-запись на ваш IPv6.
   - Дождитесь распространения записей (обычно до 5‑15 минут, максимум 24 часа).
2. Подготовьте переменные окружения
   - `cp .env.example .env`
   - В `.env` укажите:
     - `BOT_TOKEN`, `ADMIN_CHAT_ID`, `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`
     - `NEXT_PUBLIC_WEBAPP_URL=https://anonpaysub.ru/tg`
     - `DOMAIN=anonpaysub.ru`
     - `ACME_EMAIL=you@example.com` (почта для Let’s Encrypt уведомлений)
3. Запуск в продакшене (на сервере с Docker)
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```
   - Caddy автоматически выпустит HTTPS-сертификат и проксирует запросы на сервис `web`.
   - Проверьте логи: `docker compose -f docker-compose.prod.yml logs -f`
4. В BotFather выполните `/setdomain` и укажите `anonpaysub.ru`.
5. Обновите переменные в `apps/bot/.env` (или используйте `.env`) так, чтобы `NEXT_PUBLIC_WEBAPP_URL` совпадал с HTTPS-доменом, иначе бот не покажет кнопку WebApp.

## Project structure
```
apps/
  web/      # Next.js mini app + API
  bot/      # Python aiogram bot
```

## Roadmap
- Implement real payment provider (Crypto Pay API or TON)
- Add order persistence (optional), e.g., Postgres
- Add admin panel to track orders and statuses
- Add webhook deployment for bot (optional; polling used by default)

---

If you want me to integrate a specific payment provider or add persistence, say which one and I’ll wire it up.
