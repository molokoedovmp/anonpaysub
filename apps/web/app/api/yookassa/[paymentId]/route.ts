import { NextRequest, NextResponse } from 'next/server'
import { getYooEnv, yooGetPayment, yooCapturePayment } from '@/lib/yookassa'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest, { params }: { params: { paymentId: string } }) {
  try {
    const env = getYooEnv()

    const d = await yooGetPayment(env, params.paymentId)
    let status: string = d?.status
    const paid: boolean = !!d?.paid

    if ((status === 'waiting_for_capture') || (status === 'pending' && paid)) {
      try {
        const cd = await yooCapturePayment(env, params.paymentId, d?.amount)
        if (cd?.status) status = cd.status
      } catch {
        // ignore capture failure in polling; status will be updated by webhook later
      }
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

