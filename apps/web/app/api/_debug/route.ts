import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET() {
  const now = new Date().toISOString()
  console.log(`[debug] /api/_debug hit at ${now}`)
  return NextResponse.json({ ok: true, now })
}

