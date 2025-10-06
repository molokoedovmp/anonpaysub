import { NextRequest, NextResponse } from 'next/server'
import { calcRubPrice } from '@/lib/pricing'
import { fetchUsdRubRate } from '@/lib/rates'
import { verifyWebAppInitData } from '@/lib/telegram'
import { getYooEnv, yooCreatePayment } from '@/lib/yookassa'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const { initData, order } = await req.json()
    if (!order) return NextResponse.json({ error: 'order обязателен' }, { status: 400 })

    let yooEnv
    try { yooEnv = getYooEnv() } catch (e: any) {
      return NextResponse.json({ error: e?.message || 'ЮKassa не настроена' }, { status: 500 })
    }

    // amount
    const monthsMap: Record<string, number> = { '1m': 1, '3m': 3, '9m': 9, '12m': 12 }
    const months = monthsMap[order?.plan] ?? 1
    const usd = Math.max(0, Number(order?.monthlyPriceUsd || order?.price || 0)) * months
    if (!usd) return NextResponse.json({ error: 'Некорректная сумма' }, { status: 400 })

    let totalRub = 0
    try {
      const rate = await fetchUsdRubRate()
      totalRub = calcRubPrice(usd, { fx: rate })
    } catch (e) {
      const fallbackRate = Number(process.env.USD_RUB_RATE_FALLBACK || 0)
      if (fallbackRate > 0) {
        totalRub = calcRubPrice(usd, { fx: fallbackRate })
      } else {
        return NextResponse.json({ error: 'Курс недоступен, задайте USD_RUB_RATE_FALLBACK' }, { status: 502 })
      }
    }

    const metadata: Record<string, any> = {
      service: order.service,
      plan: order.plan,
      login: order.login,
      password: order.password,
      creator: order.creatorUrl || order.creator || ''
    }
    try {
      const botToken = process.env.BOT_TOKEN
      if (initData && botToken) {
        const v = verifyWebAppInitData(initData, botToken)
        if (v.ok && v.data?.user?.id) metadata.userId = String(v.data.user.id)
      }
    } catch {}

    if (!metadata.userId) {
      if (order?.telegramUserId) metadata.userId = String(order.telegramUserId)
      else if (order?.telegramUser?.id) metadata.userId = String(order.telegramUser.id)
    }

    // description ≤ 128 chars
    let description = `Подписка ${order.service} (${months} мес.)`
    if (description.length > 128) description = description.slice(0, 128)

    const payload: any = {
      amount: { value: totalRub.toFixed(2), currency: 'RUB' },
      capture: true,
      description,
      metadata,
      confirmation: {
        type: 'redirect',
        return_url: process.env.NEXT_PUBLIC_WEBAPP_URL || 'https://t.me'
      }
    }

    // Receipt
    const taxSystem = Number(process.env.YOOKASSA_TAX_SYSTEM_CODE || '1')
    const vatCode = Number(process.env.YOOKASSA_VAT_CODE || '6')
    const receiptEmail = process.env.YOOKASSA_RECEIPT_EMAIL || 'noreply@example.com'
    const rawPhone = process.env.YOOKASSA_RECEIPT_PHONE
    const normalizedPhone = rawPhone ? String(rawPhone).replace(/\D+/g, '') : undefined
    payload.receipt = {
      customer: {
        email: receiptEmail,
        ...(normalizedPhone ? { phone: normalizedPhone } : {}),
      },
      tax_system_code: taxSystem,
      items: [
        {
          description,
          amount: { value: totalRub.toFixed(2), currency: 'RUB' },
          quantity: '1.00',
          vat_code: vatCode,
          payment_mode: 'full_prepayment',
          payment_subject: 'service',
        },
      ],
    }
    if (process.env.YOOKASSA_TEST_MODE === '1') payload.test = true

    try {
      const data = await yooCreatePayment(yooEnv, payload)
      return NextResponse.json({ paymentId: data?.id, confirmationUrl: data?.confirmation?.confirmation_url })
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || 'Ошибка ЮKassa' }, { status: 502 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}

