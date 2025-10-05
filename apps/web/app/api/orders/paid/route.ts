import { NextRequest, NextResponse } from 'next/server'
import { verifyWebAppInitData, sendTelegramMessage } from '@/lib/telegram'
import { fetchUsdRubRate } from '@/lib/rates'
import { calcRubPrice } from '@/lib/pricing'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const initData: string | undefined = body?.initData
    const order = body?.order

    if (!order) {
      return NextResponse.json({ error: 'order обязателен' }, { status: 400 })
    }

    const host = req.headers.get('host') || ''
    const isLocalHost = /(^|\.)localhost(?::|$)/i.test(host) || host.startsWith('127.0.0.1')
    const isTunnel = /\.ngrok(?:-free)?\.(?:io|dev)$/i.test(host)
    const allowNoInit = isLocalHost || isTunnel || process.env.ALLOW_DEV_NO_INITDATA === '1'
    if (!allowNoInit && (!initData || initData.trim().length === 0)) {
      return NextResponse.json({ error: 'Откройте мини-приложение из Telegram (initData отсутствует).' }, { status: 400 })
    }

    const botToken = process.env.BOT_TOKEN
    const adminChatId = process.env.ADMIN_CHAT_ID
    if (!botToken || !adminChatId) {
      return NextResponse.json({ error: 'Сервер не настроен (BOT_TOKEN/ADMIN_CHAT_ID).' }, { status: 500 })
    }

    let verification: ReturnType<typeof verifyWebAppInitData> | { ok: true, data: any }
    if (allowNoInit && (!initData || initData.trim().length === 0)) {
      verification = { ok: true, data: { user: undefined, devBypass: true } }
    } else {
      const v = verifyWebAppInitData(initData!, botToken)
      if (!v.ok) {
        return NextResponse.json({ error: `Недействительные данные: ${v.error}` }, { status: 401 })
      }
      verification = v
    }

    const monthsMap: Record<string, number> = { '1m': 1, '3m': 3, '9m': 9, '12m': 12 }
    const months = monthsMap[order?.plan] ?? 1
    const monthlyPriceUsd = Number(order?.monthlyPriceUsd || 0)
    const totalUsd = Math.max(0, monthlyPriceUsd) * months
    const deltaRate = 4
    const fixedFee = 750
    const calcFromClient = order?.calc || {}

    let usdToRub = Number(calcFromClient?.usdToRub) || 0
    if (!Number.isFinite(usdToRub) || usdToRub <= 0) {
      usdToRub = await fetchUsdRubRate()
    }

    let totalRub = Number(calcFromClient?.totalRub) || 0
    if (!Number.isFinite(totalRub) || totalRub <= 0) {
      totalRub = totalUsd > 0 ? calcRubPrice(totalUsd, { fx: usdToRub, deltaRate, fixedFee }) : 0
    }

    const baseRub = totalUsd > 0 ? totalUsd * (usdToRub + deltaRate) : 0

    let commissionRub = Number(calcFromClient?.commissionRub) || 0
    if (!Number.isFinite(commissionRub) || commissionRub < 0) {
      commissionRub = Math.max(0, totalRub - baseRub)
    }
    const commissionPct = baseRub > 0 ? commissionRub / baseRub : 0

    const fallbackUser = typeof order?.telegramUser === 'object' && order?.telegramUser?.id
      ? {
          id: Number(order.telegramUser.id),
          first_name: order.telegramUser.first_name,
          last_name: order.telegramUser.last_name,
          username: order.telegramUser.username
        }
      : undefined
    const fallbackUserId = Number(order?.telegramUserId || fallbackUser?.id || NaN)
    const user = verification.data?.user
      || fallbackUser
      || (Number.isFinite(fallbackUserId) ? { id: fallbackUserId } : undefined)

    const userLine = user
      ? `${user.first_name || ''} ${user.last_name || ''} (id=${user.id}${user.username ? `, @${user.username}` : ''})`
      : 'неизвестен'

    const paymentMethod = order.paymentMethod === 'crypto'
      ? 'Оплата картой (Telegram)' : order.paymentMethod === 'yookassa'
        ? 'ЮKassa'
        : 'Договоримся позже'
    const prettyTotal = totalRub ? `${totalRub.toLocaleString('ru-RU')} ₽` : '—'

    const text = [
      '🎉 <b>Оплата подтверждена!</b>',
      '',
      `<b>👤 Клиент:</b> ${userLine}`,
      `<b>🛒 Сервис:</b> ${order.service}`,
      order.creatorUrl ? `<b>🔗 Автор:</b> <code>${order.creatorUrl}</code>` : undefined,
      `<b>📧 Логин:</b> <code>${order.login}</code>`,
      `<b>🔐 Пароль:</b> <code>${order.password}</code>`,
      `<b>📅 Тариф:</b> ${order.plan} (${months} мес.)`,
      `<b>💵 Цена/мес:</b> ${monthlyPriceUsd} USD`,
      `<b>🧮 Расчёт:</b> база ${Math.ceil(baseRub).toLocaleString('ru-RU')}₽ + ${Math.ceil(commissionRub).toLocaleString('ru-RU')}₽ комиссия (${(commissionPct * 100).toFixed(0)}%)`,
      `<b>💰 Итого:</b> ${prettyTotal}`,
      `<b>💳 Оплата:</b> ${paymentMethod}`,
      order.notes ? `<b>📝 Примечание:</b> ${order.notes}` : undefined,
      '',
      '⏰ <b>После активации подписки нажмите кнопку ниже — клиенту придёт уведомление.</b>'
    ].filter(Boolean).join('\n')

    const cbUserId = user?.id
      ? String(user.id)
      : Number.isFinite(fallbackUserId)
        ? String(fallbackUserId)
        : undefined
    const payload: any = {
      chat_id: adminChatId,
      text,
      parse_mode: 'HTML'
    }
    if (cbUserId) {
      payload.reply_markup = {
        inline_keyboard: [
          [ { text: '✅ Подписка активирована', callback_data: `subscribed:${cbUserId}:${Math.round(totalRub)}` } ],
          [ { text: '⚠️ Возникли проблемы', callback_data: `issue:${cbUserId}` } ]
        ]
      }
    }

    await sendTelegramMessage(botToken, adminChatId, payload)

    // Мягкое уведомление клиента сразу после оплаты
    if (verification.data?.user?.id) {
      const userMsg = '✅ Оплата получена!\nВ течение 15–60 минут мы оформим подписку. Если будут вопросы — просто ответьте в этом чате.'
      await sendTelegramMessage(botToken, String(verification.data.user.id), userMsg)
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
