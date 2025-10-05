import asyncio
import contextlib
import math
from typing import Any, Dict, Union

import httpx
from aiogram import Bot, Dispatcher, F
from aiogram.filters import Command, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    WebAppInfo,
)

from config import get_settings


pending_payments: Dict[str, asyncio.Task] = {}


PLAN_LABELS = {
    "1m": "1 месяц",
    "3m": "3 месяца",
    "9m": "9 месяцев",
    "12m": "12 месяцев",
}
PLAN_CHOICES = [
    ("1m", "1 месяц"),
    ("3m", "3 месяца"),
    ("9m", "9 месяцев"),
    ("12m", "12 месяцев"),
]
COMMISSION_PCT = 0.25  # legacy, not used in new formula


class OrderForm(StatesGroup):
    service = State()
    login = State()
    password = State()
    creator = State()
    plan = State()
    price = State()
    payment = State()
    notes = State()
    confirm = State()


def build_main_menu(webapp_url: str, support_url: str | None = None, privacy_url: str | None = None) -> InlineKeyboardMarkup:
    buttons = []
    if webapp_url.startswith("https://"):
        buttons.append([
            InlineKeyboardButton(
                text="Мини‑приложение", web_app=WebAppInfo(url=webapp_url)
            )
        ])
    else:
        buttons.append([
            InlineKeyboardButton(text="Мини‑приложение", url=webapp_url)
        ])
    buttons.append([
        InlineKeyboardButton(text="Оформить в чате", callback_data="chat:start")
    ])
    if support_url:
        buttons.append([InlineKeyboardButton(text="Поддержка", url=support_url)])
    else:
        buttons.append([InlineKeyboardButton(text="Поддержка", callback_data="support:open")])
    if privacy_url:
        buttons.append([InlineKeyboardButton(text="Политика конфиденциальности", url=privacy_url)])
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def plan_keyboard() -> InlineKeyboardMarkup:
    rows = [
        [InlineKeyboardButton(text=label, callback_data=f"chat:plan:{value}")]
        for value, label in PLAN_CHOICES
    ]
    rows.append([InlineKeyboardButton(text="Отмена", callback_data="chat:cancel")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def confirm_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="Подтвердить", callback_data="chat:confirm")],
            [InlineKeyboardButton(text="Изменить", callback_data="chat:restart")],
            [InlineKeyboardButton(text="Отмена", callback_data="chat:cancel")],
        ]
    )


def payment_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="Оплатить через ЮKassa", callback_data="chat:payment:yookassa")],
            [InlineKeyboardButton(text="Отмена", callback_data="chat:cancel")],
        ]
    )


async def fetch_usd_rub_rate() -> float:
    urls = [
        "https://api.exchangerate.host/latest?base=USD&symbols=RUB",
        "https://open.er-api.com/v6/latest/USD",
    ]
    async with httpx.AsyncClient(timeout=10) as client:
        last_error: Exception | None = None
        for url in urls:
            try:
                res = await client.get(url)
                res.raise_for_status()
                data = res.json()
                if "rates" in data and "RUB" in data["rates"]:
                    rate = float(data["rates"]["RUB"])
                else:
                    rate = float(data.get("result"))
                if rate > 0:
                    return rate
            except Exception as exc:  # noqa: BLE001
                last_error = exc
        raise RuntimeError(f"Не удалось получить курс USD/RUB: {last_error}")


def calc_totals(price_usd: float, plan: str, rate: float) -> Dict[str, float]:
    """Replicates mini-app pricing:
    final = ceil( ( usd * (fx + 4) * (1 + 0.03 + 0.001*usd) + 750 ) / 10 ) * 10
    where usd is total USD for the chosen plan (price_usd * months).
    """
    months_num = {
        "1m": 1,
        "3m": 3,
        "9m": 9,
        "12m": 12,
    }.get(plan, 1)
    total_usd = max(0.0, price_usd) * months_num
    delta_rate = 4
    fixed_fee = 750
    commission = 0.03 + 0.001 * total_usd
    base_rub = total_usd * (rate + delta_rate)
    price_with_commission = base_rub * (1.0 + commission)
    final_rub = math.ceil((price_with_commission + fixed_fee) / 10.0) * 10
    commission_rub = max(0, int(final_rub - base_rub))
    return {
        "months": months_num,
        "rate": rate,
        "base_usd": total_usd,
        "base_rub": base_rub,
        "commission_rub": commission_rub,
        "total_rub": int(final_rub),
    }


def format_user_summary(data: Dict[str, Any], calc: Dict[str, Any]) -> str:
    notes = data.get("notes")
    summary = [
        "Проверьте данные заказа:",
        f"• Сервис: {data['service']}",
        f"• Автор: {data['creator']}",
        f"• Логин: {data['login']}",
        f"• Пароль: {data['password']}",
        f"• Тариф: {PLAN_LABELS.get(data['plan'], data['plan'])}",
        f"• Цена/мес: {data['price']} USD",
        f"• Итого к оплате: {calc['total_rub']:.0f} ₽",
        "• Оплата: " + (
            'Telegram Pay' if data['payment'] == 'crypto'
            else 'ЮKassa' if data['payment'] == 'yookassa'
            else 'Договориться позже'
        ),
    ]
    if notes:
        summary.append(f"• Примечание: {notes}")
    summary.append("\nЕсли всё верно, подтвердите. При ошибке в данных оплатить подписку не получится.")
    return "\n".join(summary)


def build_paid_message(order: Dict[str, Any], calc: Dict[str, Any], tg_user) -> str:
    payment_method = (
        'Telegram Pay' if order['payment'] == 'crypto'
        else 'ЮKassa' if order['payment'] == 'yookassa'
        else 'Договоримся позже'
    )
    full_name = tg_user.full_name if tg_user else 'неизвестен'
    user_id = tg_user.id if tg_user else 'n/a'
    username = tg_user.username if tg_user and tg_user.username else None
    user_line = f"{full_name} (id={user_id}{f', @{username}' if username else ''})"
    plan_label = PLAN_LABELS.get(order['plan'], order['plan'])
    months = calc.get('months')
    plan_text = f"{plan_label} ({months} мес.)" if months else plan_label

    def fmt(value: Union[float, int]) -> str:
        return f"{value:,.0f}".replace(',', ' ')

    base_rub = math.ceil(calc.get('base_rub', 0))
    commission_rub = int(calc.get('commission_rub', 0))
    total_rub = int(calc.get('total_rub', 0))
    commission_pct = int(round((commission_rub / base_rub) * 100)) if base_rub > 0 else 0

    lines = [
        '🎉 <b>Оплата подтверждена!</b>',
        '',
        f"<b>👤 Клиент:</b> {user_line}",
        f"<b>🛒 Сервис:</b> {order['service']}",
        order.get('creator') and f"<b>🔗 Автор:</b> <code>{order['creator']}</code>",
        f"<b>📧 Логин:</b> <code>{order['login']}</code>",
        f"<b>🔐 Пароль:</b> <code>{order['password']}</code>",
        f"<b>📅 Тариф:</b> {plan_text}",
        f"<b>💵 Цена/мес:</b> {order['price']} USD",
        f"<b>🧮 Расчёт:</b> база {fmt(base_rub)}₽ + {fmt(commission_rub)}₽ комиссия ({commission_pct}%)",
        total_rub and f"<b>💰 Итого:</b> {fmt(total_rub)} ₽",
        f"<b>💳 Оплата:</b> {payment_method}",
        order.get('notes') and f"<b>📝 Примечание:</b> {order['notes']}",
        '',
        '⏰ <b>После активации подписки используйте кнопку ниже — клиенту придёт уведомление.</b>',
    ]
    return "\n".join([line for line in lines if line])


async def send_start_card(message: Message, settings) -> None:
    menu = build_main_menu(settings.webapp_url, settings.support_url, settings.privacy_url)
    text = (
        "<b>BazarPaySub</b>\n"
        "Анонимная оплата подписок на зарубежные сервисы сервисы."
        "\n\nВыберите, как оформить заказ."
    )
    if settings.start_card_image_url:
        try:
            await message.answer_photo(
                settings.start_card_image_url,
                caption=text,
                reply_markup=menu,
                parse_mode="HTML",
            )
            return
        except Exception:  # noqa: BLE001
            pass
    await message.answer(text, reply_markup=menu, parse_mode="HTML")


async def main():
    settings = get_settings()
    bot = Bot(settings.bot_token)
    dp = Dispatcher()

    @dp.message(CommandStart())
    async def start(m: Message, state: FSMContext):
        await state.clear()
        await send_start_card(m, settings)

    @dp.message(Command("help"))
    async def help_cmd(m: Message, state: FSMContext):
        await state.clear()
        await send_start_card(m, settings)

    @dp.message(Command("support", "поддержка"))
    async def support_cmd(m: Message, state: FSMContext):
        await state.clear()
        text = (
            "Поддержка\n\n"
            "Если у вас возникли вопросы по оплате или оформлению подписки — воспользуйтесь кнопкой ниже."
        )
        # Если есть прямая ссылка — сразу открываем чат менеджера через URL‑кнопку.
        if settings.support_url:
            kb = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="Написать менеджеру", url=settings.support_url)]])
        else:
            # Иначе — покажем callback, который отправит инструкцию.
            kb = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="Написать менеджеру", callback_data="support:open")]])
        await m.answer(text, reply_markup=kb)

    # Команда политики конфиденциальности
    @dp.message(Command("privacy", "policy", "политика"))
    async def privacy_cmd(m: Message, state: FSMContext):
        await state.clear()
        text = (
            "Политика конфиденциальности\n\n"
            "Подробно о том, какие данные мы обрабатываем и как защищаем — по ссылке ниже."
        )
        kb = InlineKeyboardMarkup(
            inline_keyboard=[[InlineKeyboardButton(text="Открыть политику", url=settings.privacy_url)]]
        )
        await m.answer(text, reply_markup=kb)

    # Открыть поддержку (фолбэк для случаев без прямой ссылки)
    @dp.callback_query(F.data == "support:open")
    async def support_open(call: CallbackQuery):
        await call.answer()
        url = settings.support_url or "https://t.me/aibazaru"
        kb = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="Открыть чат менеджера", url=url)]])
        await call.message.answer("Свяжитесь с менеджером по кнопке ниже:", reply_markup=kb)

    # Совместимость со старым callback (если остался где‑то в истории)
    @dp.callback_query(F.data == "support:contact")
    async def support_contact(call: CallbackQuery):
        await call.answer()
        url = settings.support_url or "https://t.me/aibazaru"
        kb = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="Открыть чат менеджера", url=url)]])
        await call.message.answer("Свяжитесь с менеджером по кнопке ниже:", reply_markup=kb)

    @dp.message(Command("cancel"))
    async def cancel_cmd(m: Message, state: FSMContext):
        await state.clear()
        await m.answer("Заявка отменена. Чтобы начать заново, выберите вариант ниже.", reply_markup=build_main_menu(settings.webapp_url, settings.support_url, settings.privacy_url))

    @dp.callback_query(F.data == "chat:cancel")
    async def cancel_cb(call: CallbackQuery, state: FSMContext):
        await call.answer("Заявка отменена", show_alert=False)
        await state.clear()
        with contextlib.suppress(Exception):
            await call.message.edit_reply_markup()
        await call.message.answer("Заявка отменена. Вы можете начать заново.", reply_markup=build_main_menu(settings.webapp_url, settings.support_url, settings.privacy_url))

    @dp.callback_query(F.data == "chat:restart")
    async def restart_cb(call: CallbackQuery, state: FSMContext):
        await call.answer()
        with contextlib.suppress(Exception):
            await call.message.edit_reply_markup()
        await state.clear()
        await start_chat_flow(call, state)

    async def start_chat_flow(call: CallbackQuery, state: FSMContext):
        await state.clear()
        await state.set_state(OrderForm.service)
        await call.message.answer(
            "Давайте оформим заказ в чате.\nВведите сервис (например: Chatgpt, Patreon, Lovable).\n\nМожно отменить в любой момент командой /cancel."
        )

    @dp.callback_query(F.data == "chat:start")
    async def chat_start(call: CallbackQuery, state: FSMContext):
        await call.answer()
        await start_chat_flow(call, state)

    @dp.message(OrderForm.service)
    async def service_step(m: Message, state: FSMContext):
        service = m.text.strip()
        await state.update_data(service=service)
        await state.set_state(OrderForm.login)
        await m.answer("Введите логин, под которым оформлена подписка:")

    @dp.message(OrderForm.login)
    async def login_step(m: Message, state: FSMContext):
        login = m.text.strip()
        if not login:
            await m.answer("Введите логин")
            return
        await state.update_data(login=login)
        await state.set_state(OrderForm.password)
        await m.answer("Введите пароль от аккаунта (используется только для оплаты, не хранится):")

    @dp.message(OrderForm.password)
    async def password_step(m: Message, state: FSMContext):
        password = m.text.strip()
        if not password:
            await m.answer("Пароль не может быть пустым")
            return
        await state.update_data(password=password)
        await state.set_state(OrderForm.creator)
        await m.answer("Пришлите ссылку на сервив / автора, на который оформляем подписку:")

    @dp.message(OrderForm.creator)
    async def creator_step(m: Message, state: FSMContext):
        creator = m.text.strip()
        await state.update_data(creator=creator)
        await state.set_state(OrderForm.plan)
        await m.answer("Выберите срок подписки:", reply_markup=plan_keyboard())

    @dp.callback_query(OrderForm.plan, F.data.startswith("chat:plan:"))
    async def plan_choice(call: CallbackQuery, state: FSMContext):
        await call.answer()
        plan = call.data.split(":")[-1]
        await state.update_data(plan=plan)
        await state.set_state(OrderForm.price)
        with contextlib.suppress(Exception):
            await call.message.edit_reply_markup()
        await call.message.answer("Введите стоимость подписки в месяц (USD):")

    @dp.message(OrderForm.plan)
    async def plan_text_prompt(m: Message):
        await m.answer("Пожалуйста, выберите срок подписки с помощью кнопок ниже.", reply_markup=plan_keyboard())

    @dp.message(OrderForm.price)
    async def price_step(m: Message, state: FSMContext):
        text = m.text.replace(',', '.').strip()
        try:
            price = float(text)
        except ValueError:
            await m.answer("Введите число, например 30 или 29.99")
            return
        if price <= 0:
            await m.answer("Стоимость должна быть больше 0")
            return
        await state.update_data(price=price)
        await state.set_state(OrderForm.notes)
        await m.answer("Дополнительная информация (если нет — отправьте '-'):")


    @dp.message(OrderForm.notes)
    async def notes_step(m: Message, state: FSMContext):
        notes_raw = m.text.strip()
        notes = '' if notes_raw in {'-', 'нет', 'Нет', 'no', 'No'} else notes_raw
        await state.update_data(notes=notes)

        data = await state.get_data()
        try:
            rate = await fetch_usd_rub_rate()
        except Exception as exc:  # noqa: BLE001
            await m.answer(f"Не удалось получить курс USD/RUB: {exc}. Попробуйте позже.")
            await state.clear()
            return

        calc = calc_totals(data['price'], data['plan'], rate)
        await state.update_data(calc=calc)
        await state.set_state(OrderForm.confirm)
        summary = format_user_summary(
            {
                "service": data['service'],
                "login": data['login'],
                "password": data['password'],
                "creator": data['creator'],
                "plan": data['plan'],
                "price": data['price'],
                "payment": 'yookassa',  # По умолчанию ЮKassa
                "notes": notes,
            },
            calc,
        )
        await m.answer(summary, reply_markup=confirm_keyboard())

    @dp.callback_query(OrderForm.confirm, F.data == "chat:confirm")
    async def confirm_order(call: CallbackQuery, state: FSMContext):
        await call.answer()
        data = await state.get_data()
        calc = data['calc']
        await state.set_state(OrderForm.payment)
        with contextlib.suppress(Exception):
            await call.message.edit_reply_markup()
        await call.message.answer("Отлично! Теперь выберите способ оплаты:", reply_markup=payment_keyboard())

    @dp.callback_query(OrderForm.payment, F.data.startswith("chat:payment:"))
    async def payment_step(call: CallbackQuery, state: FSMContext):
        await call.answer()
        payment = call.data.split(":")[-1]
        data = await state.get_data()
        order = {
            "service": data['service'],
            "login": data['login'],
            "password": data['password'],
            "creator": data['creator'],
            "plan": data['plan'],
            "price": data['price'],
            "payment": payment,
            "notes": data.get('notes') or '',
        }
        calc = data['calc']
        await state.clear()
        with contextlib.suppress(Exception):
            await call.message.edit_reply_markup()

        if order['payment'] == 'yookassa':
            await call.message.answer("Создаём счёт в ЮKassa...")
            try:
                # Берём URL из окружения как есть
                web_url = settings.payments_base_url
                
                async with httpx.AsyncClient(timeout=15) as client:
                    print(f"Creating payment via: {web_url}/api/yookassa/create")
                    resp = await client.post(
                        f"{web_url}/api/yookassa/create",
                        json={
                            # initData не используется в боте — прокинем user id в заказ
                            "order": {
                                "service": order['service'],
                                "login": order['login'],
                                "password": order['password'],
                                "creatorUrl": order['creator'],
                                "plan": order['plan'],
                                "monthlyPriceUsd": order['price'],
                                "notes": order['notes'],
                                "paymentMethod": 'yookassa',
                                "telegramUserId": call.from_user.id,
                                "telegramUser": {
                                    "id": call.from_user.id,
                                    "first_name": getattr(call.from_user, 'first_name', None),
                                    "last_name": getattr(call.from_user, 'last_name', None),
                                    "username": getattr(call.from_user, 'username', None),
                                },
                            }
                        },
                        headers={"Content-Type": "application/json"}
                    )
                print(f"Payment creation response: {resp.status_code}")
                data_resp = resp.json()
                print(f"Payment creation data: {data_resp}")
                if resp.status_code >= 400:
                    raise RuntimeError(data_resp.get('error') or 'Не удалось создать платёж')
                payment_id = data_resp.get('paymentId')
                confirmation_url = data_resp.get('confirmationUrl')
                if not payment_id or not confirmation_url:
                    raise RuntimeError('Некорректный ответ ЮKassa')

                await call.message.answer(
                    f"Счёт на {int(calc['total_rub'])} ₽ создан. Оплатите по кнопке ниже — после оплаты мы уведомим менеджера.",
                    reply_markup=InlineKeyboardMarkup(
                        inline_keyboard=[[InlineKeyboardButton(text="Оплатить через ЮKassa", url=confirmation_url)]]
                    ),
                )

                async def poll_status():
                    try:
                        async with httpx.AsyncClient(timeout=15) as client:
                            attempts = 0
                            max_attempts = 24  # ~2 minutes at 5s interval
                            while True:
                                await asyncio.sleep(5)
                                print(f"Checking payment status: {payment_id}")
                                status_resp = await client.get(
                                    f"{web_url}/api/yookassa/{payment_id}",
                                    headers={"Content-Type": "application/json"}
                                )
                                print(f"Status check response: {status_resp.status_code}")
                                data_status = status_resp.json()
                                print(f"Status data: {data_status}")
                                if status_resp.status_code >= 400:
                                    print("Status check failed, breaking")
                                    break
                                status = data_status.get('status')
                                print(f"Payment status: {status}")
                                if status in {'succeeded', 'waiting_for_capture'}:
                                    admin_text = build_paid_message(order, calc, call.from_user)
                                    total_amount = int(calc.get('total_rub') or 0)
                                    keyboard = InlineKeyboardMarkup(
                                        inline_keyboard=[
                                            [InlineKeyboardButton(
                                                text="✅ Подписка активирована",
                                                callback_data=f"subscribed:{call.from_user.id}:{total_amount}"
                                            )],
                                            [InlineKeyboardButton(
                                                text="⚠️ Возникли проблемы",
                                                callback_data=f"issue:{call.from_user.id}"
                                            )]
                                        ]
                                    )
                                    await call.bot.send_message(
                                        settings.admin_chat_id,
                                        admin_text,
                                        parse_mode="HTML",
                                        reply_markup=keyboard
                                    )
                                    await call.message.answer(
                                        "✅ Оплата получена!\nВ течение 15–60 минут мы оформим подписку."
                                    )
                                    break
                                if status == 'canceled':
                                    await call.message.answer("Платёж отменён. Если хотите попробовать снова, создайте заказ заново.")
                                    break
                                attempts += 1
                                if attempts >= max_attempts:
                                    # Останавливаем опрос — решение придёт через вебхук
                                    await call.message.answer(
                                        "ℹ️ Статус оплаты обновится через несколько минут автоматически."
                                    )
                                    break
                    finally:
                        pending_payments.pop(payment_id, None)

                pending_payments[payment_id] = asyncio.create_task(poll_status())
            except Exception as exc:  # noqa: BLE001
                await call.message.answer(f"Не удалось создать счёт: {exc}")
            return

        # Остальные методы — сразу отправляем админу с кнопками действий
        admin_text = build_paid_message(order, calc, call.from_user)
        keyboard = InlineKeyboardMarkup(
            inline_keyboard=[
                [InlineKeyboardButton(
                    text="✅ Подписка активирована",
                    callback_data=f"subscribed:{call.from_user.id}:{int(calc['total_rub'])}"
                )],
                [InlineKeyboardButton(
                    text="⚠️ Возникли проблемы",
                    callback_data=f"issue:{call.from_user.id}"
                )]
            ]
        )
        await call.bot.send_message(
            settings.admin_chat_id,
            admin_text,
            parse_mode="HTML",
            reply_markup=keyboard
        )
        await call.message.answer(
            f"Заказ принят! Итог к оплате: {calc['total_rub']:.0f} ₽. Менеджер свяжется с вами после обработки."
        )

    @dp.callback_query(OrderForm.confirm, F.data == "chat:restart")
    async def confirm_restart(call: CallbackQuery, state: FSMContext):
        await call.answer()
        await start_chat_flow(call, state)

    @dp.callback_query(F.data.startswith("paidnotify:"))
    async def paid_notify_legacy(call: CallbackQuery):
        with contextlib.suppress(Exception):
            await call.answer()
        payload = call.data.split(":")
        user_id = None
        total = None
        if len(payload) >= 2:
            try:
                user_id = int(payload[1])
            except Exception:
                user_id = None
        if len(payload) >= 3:
            try:
                total = int(payload[2])
            except Exception:
                total = None

        sent = False
        if user_id:
            message_text = (
                "🎉 <b>Подписка оформлена!</b>\n\n"
                "⏰ Доступ будет предоставлен в течение 15–60 минут."
            )
            if total and total > 0:
                message_text = (
                    "🎉 <b>Подписка оформлена!</b>\n\n"
                    f"💰 Сумма: {total} ₽\n"
                    "⏰ Доступ будет предоставлен в течение 15–60 минут."
                )
            try:
                await call.bot.send_message(user_id, message_text, parse_mode="HTML")
                sent = True
            except Exception:
                sent = False

        base_text = call.message.html_text or call.message.text or ''
        status_line = '✅ Клиент уведомлён об успешной оплате.' if sent else '⚠️ Не удалось уведомить клиента (проверьте, писал ли он боту).'
        try:
            await call.message.edit_text(
                base_text + '\n\n' + status_line,
                parse_mode='HTML'
            )
        except Exception:
            pass

        if not sent:
            await call.message.answer('⚠️ Сообщение клиенту не доставлено. Клиент должен сначала написать боту в личные сообщения.')

    @dp.callback_query(F.data.startswith("subscribed:"))
    async def subscribed_cb(call: CallbackQuery):
        with contextlib.suppress(Exception):
            await call.answer()
        parts = call.data.split(":")
        user_id = int(parts[1]) if len(parts) > 1 else None
        total = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else None
        if user_id:
            text = (
                "🎉 <b>Подписка оформлена!</b>\n\n"
                + (f"💰 Сумма: {total} ₽\n" if total else "")
                + "Хорошего пользования! Если будут вопросы — отвечайте в этом чате."
            )
            with contextlib.suppress(Exception):
                await call.bot.send_message(user_id, text, parse_mode="HTML")
        with contextlib.suppress(Exception):
            await call.message.edit_text((call.message.html_text or call.message.text or '') + "\n\n✅ Клиент уведомлён.", parse_mode='HTML')

    @dp.callback_query(F.data.startswith("issue:"))
    async def issue_cb(call: CallbackQuery):
        with contextlib.suppress(Exception):
            await call.answer()
        parts = call.data.split(":")
        user_id = int(parts[1]) if len(parts) > 1 else None
        if user_id:
            text = (
                "⚠️ <b>Возникла проблема с оформлением</b>\n\n"
                "Пожалуйста, свяжитесь с менеджером, ответив в этом чате, — мы быстро поможем."
            )
            with contextlib.suppress(Exception):
                await call.bot.send_message(user_id, text, parse_mode="HTML")
        with contextlib.suppress(Exception):
            await call.message.edit_text((call.message.html_text or call.message.text or '') + "\n\n⚠️ Клиенту отправлена просьба связаться с менеджером.", parse_mode='HTML')

    @dp.message(OrderForm.payment)
    async def payment_text_prompt(m: Message):
        await m.answer("Выберите способ оплаты кнопками ниже.", reply_markup=payment_keyboard())

    @dp.message()
    async def fallback(m: Message, state: FSMContext):
        if await state.get_state() is not None:
            await m.answer("Пожалуйста, следуйте инструкциям. Чтобы отменить, используйте /cancel.")
        else:
            await send_start_card(m, settings)

    await dp.start_polling(bot)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        pass
