import { NextResponse } from 'next/server'
import { fetchUsdRubRate } from '@/lib/rates'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const rate = await fetchUsdRubRate()
    return NextResponse.json({ rate })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'rate unavailable' }, { status: 502 })
  }
}

