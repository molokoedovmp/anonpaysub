import { NextRequest, NextResponse } from 'next/server'
import { calcRubPrice } from '@/lib/pricing'
import { fetchUsdRubRate } from '@/lib/rates'
import { verifyWebAppInitData } from '@/lib/telegram'
import { Buffer } from 'buffer'
import crypto from 'crypto'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const { initData, order } = await req.json()
    if (!order) return NextResponse.json({ error: 'order обязателен' }, { status: 400 })

    const key = process.env.YOOKASSA_KEY
    const shopId = process.env.YOOKASSA_SHOP_ID
    if (!key || !shopId) return NextResponse.json({ error: 'ЮKassa не настроена' }, { status: 500 })

    // amount
    const monthsMap: Record<string, number> = { '1m': 1, '3m': 3, '9m': 9, '12m': 12 }
    const months = monthsMap[order?.plan] ?? 1
    const usd = Math.max(0, Number(order?.monthlyPriceUsd || order?.price || 0)) * months
    if (!usd) return NextResponse.json({ error: 'Некорректная сумма' }, { status: 400 })
    // Берём актуальный курс с провайдеров (как было раньше)
    const rate = await fetchUsdRubRate()
    const totalRub = calcRubPrice(usd, { fx: rate })

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
      if (order?.telegramUserId) {
        metadata.userId = String(order.telegramUserId)
      } else if (order?.telegramUser?.id) {
        metadata.userId = String(order.telegramUser.id)
      }
    }

    // Безопасное описание платежа (ограничение ЮKassa ≤ 128 символов)
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

    // Формируем чек (receipt) всегда, с дефолтами (без необходимости настраивать .env)
    const taxSystem = Number(process.env.YOOKASSA_TAX_SYSTEM_CODE || '1') // ОСН по умолчанию
    const vatCode = Number(process.env.YOOKASSA_VAT_CODE || '6')          // 6 — без НДС
    const receiptEmail = process.env.YOOKASSA_RECEIPT_EMAIL || 'aiBazaru@yandex.ru'
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

    const idem = crypto.randomUUID()
    let data: any = {}
    try {
      const res = await fetch('https://api.yookassa.ru/v3/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotence-Key': idem,
          Authorization: 'Basic ' + Buffer.from(`${shopId}:${key}`).toString('base64')
        },
        body: JSON.stringify(payload)
      })
      data = await res.json().catch(() => ({}))
      if (!res.ok) {
        return NextResponse.json({ error: data?.description || 'Ошибка ЮKassa' }, { status: 502 })
      }
    } catch (e: any) {
      // Сетевой сбой до ЮKassa → отдаём понятную ошибку клиенту
      return NextResponse.json({ error: e?.message || 'Не удалось связаться с ЮKassa' }, { status: 502 })
    }

    return NextResponse.json({ paymentId: data?.id, confirmationUrl: data?.confirmation?.confirmation_url })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
