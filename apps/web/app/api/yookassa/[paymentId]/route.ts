import { NextRequest, NextResponse } from 'next/server'
import { Buffer } from 'buffer'
import crypto from 'crypto'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest, { params }: { params: { paymentId: string } }) {
  try {
    const key = process.env.YOOKASSA_KEY
    const shopId = process.env.YOOKASSA_SHOP_ID
    if (!key || !shopId) return NextResponse.json({ error: 'ЮKassa не настроена' }, { status: 500 })

    const auth = 'Basic ' + Buffer.from(`${shopId}:${key}`).toString('base64')

    const r = await fetch(`https://api.yookassa.ru/v3/payments/${params.paymentId}`, {
      headers: { Authorization: auth }
    })
    const d = await r.json()
    if (!r.ok) return NextResponse.json({ error: d?.description || 'Ошибка ЮKassa' }, { status: 502 })

    let status: string = d?.status
    const paid: boolean = !!d?.paid

    if ((status === 'waiting_for_capture') || (status === 'pending' && paid)) {
      const idem = crypto.randomUUID()
      const cap = await fetch(`https://api.yookassa.ru/v3/payments/${params.paymentId}/capture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': auth,
          'Idempotence-Key': idem
        },
        body: JSON.stringify({ amount: d?.amount })
      })
      const cd = await cap.json().catch(() => ({}))
      if (cap.ok && cd?.status) status = cd.status
    }

    return NextResponse.json({
      status,
      paid: d?.paid ?? false,
      cancellation_details: d?.cancellation_details || null,
      amount: d?.amount || null,
      description: d?.description || null
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
