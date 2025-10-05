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

    // server-side calculation with live rate and 25% commission
    let rate: number
    try {
      rate = await fetchUsdRubRate()
    } catch (error: any) {
      return NextResponse.json({ error: 'Курс USD/RUB недоступен, попробуйте позже.' }, { status: 502 })
    }
    const monthsMap: Record<string, number> = { '1m': 1, '3m': 3, '9m': 9, '12m': 12 }
    const months = monthsMap[order?.plan] ?? 1
    const monthlyPriceUsd = Number(order?.monthlyPriceUsd || 0)
    const baseUsd = Math.max(0, monthlyPriceUsd) * months
    const deltaRate = 4
    const fixedFee = 750
    const baseRub = baseUsd * (rate + deltaRate)
    const totalRub = baseUsd > 0 ? calcRubPrice(baseUsd, { fx: rate, deltaRate, fixedFee }) : 0
    const commissionRub = Math.max(0, totalRub - baseRub)
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

    if (order?.paymentMethod === 'other') {
      const userLine = user
        ? `${user.first_name || ''} ${user.last_name || ''} (id=${user.id}${user.username ? `, @${user.username}` : ''})`
        : 'неизвестен'

      const prettyTotal = totalRub ? `${totalRub.toLocaleString('ru-RU')} ₽` : '—'
      const text = [
        '📝 <b>Новая заявка на оплату</b>',
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
        order.notes ? `<b>📝 Примечание:</b> ${order.notes}` : undefined,
        '',
        'После оплаты нажмите кнопку ниже, чтобы уведомить клиента.'
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

      if (cbUserId) {
        const userMsg = '✅ Заявка получена! Менеджер свяжется с вами и завершит оформление в ближайшее время.'
        try {
          await sendTelegramMessage(botToken, cbUserId, userMsg)
        } catch (err) {
          console.error('Failed to notify user about manual payment request', err)
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
