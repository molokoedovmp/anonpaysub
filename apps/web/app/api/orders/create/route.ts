import { NextRequest, NextResponse } from 'next/server'
import { verifyWebAppInitData, sendTelegramMessage, formatOrderMessage } from '@/lib/telegram'
import { fetchUsdRubRate } from '@/lib/rates'

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
    const allowNoInit = isLocalHost || process.env.ALLOW_DEV_NO_INITDATA === '1'
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
    const baseRub = baseUsd * rate
    const commissionPct = 0.25
    const commissionRub = Math.ceil(baseRub * commissionPct)
    const totalRub = Math.ceil(baseRub + commissionRub)

    const text = formatOrderMessage(order, verification.data, { usdToRub: rate, commissionPct, months, baseUsd, baseRub, commissionRub, totalRub })
    await sendTelegramMessage(botToken, adminChatId, text)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
