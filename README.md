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
- Multi-step mini app: ввод данных → расчёт → подтверждение → успешная анимация
- Verify Telegram `initData` HMAC in API using `BOT_TOKEN`
- Forward orders to `ADMIN_CHAT_ID` via Telegram sendMessage
- Chat-based order wizard inside the bot (без WebApp) с пошаговым опросом пользователя
- Pluggable payment provider stub (e.g., Crypto Pay, TON, USDT). Not implemented — replace stub with your provider.

## Quick start (dev)
1. Create .env file in project root with required variables:
   ```bash
   # Создайте файл .env в корне проекта
   touch .env
   ```
2. Fill these REQUIRED vars in .env:
   - `BOT_TOKEN`: BotFather token (ОБЯЗАТЕЛЬНО)
   - `ADMIN_CHAT_ID`: Your Telegram ID or target chat ID (ОБЯЗАТЕЛЬНО)
   - `YOOKASSA_SHOP_ID`: YooKassa Shop ID (ОБЯЗАТЕЛЬНО для оплаты)
   - `YOOKASSA_KEY`: YooKassa Secret Key (ОБЯЗАТЕЛЬНО для оплаты)
   
   Optional vars:
   - `NEXT_PUBLIC_WEBAPP_URL`: Public URL for the mini app (default: `http://localhost:3000/tg`)
   - `PAYMENTS_API_BASE`: Base URL for bot API calls (default: `http://localhost:3000`)
   - `YOOKASSA_TEST_MODE`: `1` for test mode, `0` for production
   - `ALLOW_DEV_NO_INITDATA`: `1` to allow testing outside Telegram WebApp
   - `NEXT_PUBLIC_PAYMENT_SLUG`: Telegram Payments slug for crypto payments
   - `START_CARD_IMAGE_URL`: Image for bot start card
3. Run locally
   - With Docker: `docker compose up --build`
   - Or manually:
     - Web: `cd apps/web && npm i && npm run dev`
     - Bot: `cd apps/bot && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && python main.py`
   - В боте используйте `/start`: появится карточка с двумя вариантами — мини‑приложение (WebApp) и оформление в чате. Для отмены диалога в чате есть команда `/cancel`.

## Troubleshooting

### Проблема: "All connection attempts failed" в боте
**Решение**: Убедитесь, что в .env файле правильно указан `PAYMENTS_API_BASE`. Для Docker используйте `http://web:3000`, для локальной разработки `http://localhost:3000`.

### Проблема: Ссылка ЮKassa не открывается в веб-приложении
**Решение**: Это нормальное поведение в некоторых версиях Telegram. Ссылка появится внизу страницы - нажмите на неё для перехода к оплате.

### Проблема: После оплаты ничего не происходит
**Решение**: 
1. Проверьте, что все обязательные переменные окружения установлены
2. Откройте консоль браузера (F12) и посмотрите на логи
3. Убедитесь, что `ADMIN_CHAT_ID` указан правильно
4. Проверьте, что бот может отправлять сообщения в указанный чат

### Проблема: Бот не может подключиться к веб-приложению
**Решение**: В Docker окружении бот должен обращаться к сервису `web`, а не `localhost`. Убедитесь, что `PAYMENTS_API_BASE=http://web:3000` в .env файле.

### Проблема: Переменные окружения не загружаются
**Решение**: 
1. Убедитесь, что файл `.env` находится в корне проекта (рядом с docker-compose.yml)
2. Перезапустите Docker: `docker compose down && docker compose up --build`
3. Проверьте логи: `docker compose logs bot` и `docker compose logs web`

### Отладка
Для отладки откройте консоль браузера (F12) и посмотрите на логи. В коде добавлена подробная отладочная информация для:
- Создания платежей ЮKassa
- Проверки статуса оплаты
- Уведомлений менеджера
- Ошибок подключения

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
