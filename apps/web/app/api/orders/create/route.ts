import { NextRequest, NextResponse } from 'next/server'
import { verifyWebAppInitData, formatOrderMessage, sendTelegramMessage } from '@/lib/telegram'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const initData: string | undefined = body?.initData
    const order: any = body?.order
    if (!order) return NextResponse.json({ error: 'order обязателен' }, { status: 400 })

    const botToken = process.env.BOT_TOKEN || ''
    const adminChatId = process.env.ADMIN_CHAT_ID || ''
    if (!botToken || !adminChatId) {
      return NextResponse.json({ error: 'BOT_TOKEN/ADMIN_CHAT_ID не настроены' }, { status: 500 })
    }

    // Verify Telegram WebApp initData unless explicitly allowed in dev
    let verify: { ok: true, data: any } | { ok: false, error: string } = { ok: false, error: 'no initData' }
    const allowNoInit = process.env.ALLOW_DEV_NO_INITDATA === '1'
    if (initData && botToken) {
      try { verify = verifyWebAppInitData(initData, botToken) } catch (e: any) { verify = { ok: false, error: e?.message || 'verify error' } }
    }
    if (!allowNoInit && (!initData || !verify || (verify as any).ok !== true)) {
      return NextResponse.json({ error: 'Некорректные данные WebApp' }, { status: 401 })
    }

    // Build and send message to admin
    const text = formatOrderMessage(order, (verify as any).data, order?.calc)
    try {
      await sendTelegramMessage(botToken, adminChatId, text)
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || 'Не удалось уведомить администратора' }, { status: 502 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}

