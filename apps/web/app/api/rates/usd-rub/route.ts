import { NextResponse } from 'next/server'
import { fetchUsdRubRate } from '@/lib/rates'

export async function GET() {
  try {
    const rate = await fetchUsdRubRate()
    return NextResponse.json({ rate })
  } catch (error: any) {
    return NextResponse.json({ error: 'rate_unavailable', message: error?.message }, { status: 502 })
  }
}
