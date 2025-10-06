import { NextRequest, NextResponse } from 'next/server'
import { Buffer } from 'buffer'
import crypto from 'crypto'
import { sendTelegramMessage } from '@/lib/telegram'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const shopId = process.env.YOOKASSA_SHOP_ID
    const key = process.env.YOOKASSA_KEY
    const allowNoAuth = process.env.YOOKASSA_WEBHOOK_ALLOW_NO_AUTH === '1'
    const token = process.env.YOOKASSA_WEBHOOK_TOKEN

    const auth = req.headers.get('authorization') || ''
    const xToken = req.headers.get('x-auth-token') || ''
    const expected = 'Basic ' + Buffer.from(`${shopId}:${key}`).toString('base64')
    if (!allowNoAuth && !(auth === expected || (token && xToken === token))) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const event = body?.event
    const obj = body?.object
    if (!event || !obj) return NextResponse.json({ ok: true })

    async function captureIfNeeded() {
      if (obj?.status === 'waiting_for_capture' || (obj?.status === 'pending' && obj?.paid === true)) {
        const idem = crypto.randomUUID()
        const r = await fetch(`https://api.yookassa.ru/v3/payments/${obj.id}/capture`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': expected,
            'Idempotence-Key': idem
          },
          body: JSON.stringify({ amount: obj.amount })
        })
        const d = await r.json().catch(() => ({}))
        return d?.status || obj.status
      }
      return obj?.status
    }

    const finalStatus = await captureIfNeeded()

    if (finalStatus === 'succeeded') {
      const botToken = process.env.BOT_TOKEN!
      const adminChatId = process.env.ADMIN_CHAT_ID!
      const md = obj?.metadata || {}
      const amount = obj?.amount?.value
      const lines = [
        '🎉 <b>Оплата подтверждена!</b>',
        md.userId ? `<b>👤 Клиент:</b> id=${md.userId}` : undefined,
        md.service ? `<b>🛒 Сервис:</b> ${md.service}` : undefined,
        md.creator ? `<b>🔗 Автор:</b> <code>${md.creator}</code>` : undefined,
        md.login ? `<b>📧 Логин:</b> <code>${md.login}</code>` : undefined,
        md.password ? `<b>🔐 Пароль:</b> <code>${md.password}</code>` : undefined,
        md.plan ? `<b>📅 Тариф:</b> ${md.plan}` : undefined,
        `<b>💰 Сумма:</b> ${amount} RUB`,
        '',
        'После активации подписки используйте кнопки ниже.'
      ].filter(Boolean).join('\n')

      const payload: any = { chat_id: adminChatId, text: lines, parse_mode: 'HTML' }
      if (md.userId) {
        payload.reply_markup = { inline_keyboard: [
          [{ text: '✅ Подписка активирована', callback_data: `subscribed:${md.userId}:${Math.round(Number(amount||0))}` }],
          [{ text: '⚠️ Возникли проблемы', callback_data: `issue:${md.userId}` }]
        ] }
      }
      await sendTelegramMessage(botToken, adminChatId, payload)

      // Мягкое уведомление клиента сразу после оплаты
      if (md.userId) {
        const userMsg = (
          '✅ Оплата получена!\n' +
          'В течение 15–60 минут мы оформим подписку. Если будут вопросы — просто ответьте в этом чате.'
        )
        await sendTelegramMessage(botToken, String(md.userId), userMsg)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: true })
  }
}
