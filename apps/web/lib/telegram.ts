import crypto from 'crypto'

type InitUser = {
  id: number
  first_name?: string
  last_name?: string
  username?: string
}

export function verifyWebAppInitData(initData: string, botToken: string): { ok: true, data: any } | { ok: false, error: string } {
  try {
    const url = new URLSearchParams(initData)
    const hash = url.get('hash') || ''
    url.delete('hash')

    // Build data-check-string
    const pairs: string[] = []
    Array.from(url.keys()).sort().forEach((key) => {
      const value = url.get(key)
      if (value !== null) pairs.push(`${key}=${value}`)
    })
    const dataCheckString = pairs.join('\n')

    // Secret key = HMAC_SHA256(key='WebAppData', data=botToken)
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest()

    // Verify hash = HMAC_SHA256(key=secretKey, data=dataCheckString)
    const calcHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex')

    if (calcHash !== hash) return { ok: false, error: 'hash mismatch' }

    // Parse user JSON if present
    const userRaw = url.get('user')
    let user: InitUser | undefined = undefined
    if (userRaw) {
      try { user = JSON.parse(userRaw) } catch {}
    }

    return { ok: true, data: { user } }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'verify error' }
  }
}

export function formatOrderMessage(
  order: any,
  data?: { user?: InitUser },
  calc?: { usdToRub: number, commissionPct: number, months: number, baseUsd: number, baseRub: number, commissionRub: number, totalRub: number }
) {
  const u = data?.user
  const userStr = u ? `#user${u.id}${u.username ? ` (@${u.username})` : ''}` : 'unknown user'

  const monthsMap: Record<string, number> = { '1m': 1, '3m': 3, '9m': 9, '12m': 12 }
  const months = calc?.months ?? (monthsMap[order?.plan] ?? 1)
  const monthlyPriceUsd = Number(order?.monthlyPriceUsd || 0)

  const usdToRub = calc?.usdToRub ?? Number(order?.calc?.usdToRub || 0)
  const commissionPct = calc?.commissionPct ?? Number(order?.calc?.commissionPct || 0.25)

  const baseUsd = calc?.baseUsd ?? (Math.max(0, Number(order?.monthlyPriceUsd || 0)) * months)
  const baseRub = calc?.baseRub ?? (baseUsd * usdToRub)
  const commissionRub = calc?.commissionRub ?? Math.ceil(baseRub * commissionPct)
  const totalRub = calc?.totalRub ?? Math.ceil(baseRub + commissionRub)

  const lines = [
    `Новый заказ от ${userStr}:`,
    `Сервис: ${order.service}`,
    ...(order.creatorUrl ? [`Автор: ${order.creatorUrl}`] : []),
    `Логин: ${order.login}`,
    `Пароль: ${order.password}`,
    `Тариф: ${order.plan} (${months} мес.)`,
    `Цена/мес: ${order.monthlyPriceUsd} USD`,
    `Расчёт (курс ${usdToRub.toFixed(2)}₽): база ${baseRub.toFixed(0)}₽ + комиссия ${(commissionPct*100).toFixed(0)}% → ${commissionRub.toFixed(0)}₽`,
    `Итого к оплате: ${totalRub.toFixed(0)}₽`,
    ...(order.paymentMethod ? [`Оплата: ${order.paymentMethod === 'crypto' ? 'Telegram Pay' : order.paymentMethod === 'yookassa' ? 'ЮKassa' : order.paymentMethod}`] : []),
    ...(order.txHash ? [`TX: ${order.txHash}`] : []),
    ...(order.notes ? [`Примечание: ${order.notes}`] : [])
  ]
  return lines.join('\n')
}

export async function sendTelegramMessage(botToken: string, chatId: string, payload: string | Record<string, any>) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`
  const body = typeof payload === 'string' ? { chat_id: chatId, text: payload } : { chat_id: chatId, ...payload }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const msg = await res.text()
    throw new Error(`sendMessage failed: ${res.status} ${msg}`)
  }
}
