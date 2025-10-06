import { Buffer } from 'buffer'

export type YooEnv = {
  shopId: string
  key: string
}

export function getYooEnv(): YooEnv {
  const shopId = process.env.YOOKASSA_SHOP_ID || ''
  const key = process.env.YOOKASSA_KEY || ''
  if (!shopId || !key) {
    throw new Error('ЮKassa не настроена: проверьте YOOKASSA_SHOP_ID и YOOKASSA_KEY')
  }
  return { shopId, key }
}

export function authHeader(env: YooEnv): string {
  return 'Basic ' + Buffer.from(`${env.shopId}:${env.key}`).toString('base64')
}

export async function fetchWithTimeout(input: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const { timeoutMs = 15000, ...rest } = init
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(input, { ...rest, signal: controller.signal })
    return res
  } finally {
    clearTimeout(t)
  }
}

export async function yooCreatePayment(env: YooEnv, payload: any, idemKey?: string) {
  const res = await fetchWithTimeout('https://api.yookassa.ru/v3/payments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotence-Key': idemKey || cryptoRandomId(),
      'Authorization': authHeader(env)
    },
    body: JSON.stringify(payload),
    timeoutMs: 20000
  })
  const data = await safeJson(res)
  if (!res.ok) {
    const msg = data?.description || `YooKassa error ${res.status}`
    const err: any = new Error(msg)
    err.yoo = { status: res.status, parameter: (data as any)?.parameter, type: (data as any)?.type, code: (data as any)?.code, response: data }
    throw err
  }
  return data
}

export async function yooGetPayment(env: YooEnv, id: string) {
  const res = await fetchWithTimeout(`https://api.yookassa.ru/v3/payments/${id}`, {
    headers: { 'Authorization': authHeader(env) },
    timeoutMs: 15000
  })
  const data = await safeJson(res)
  if (!res.ok) {
    const msg = data?.description || `YooKassa error ${res.status}`
    const err: any = new Error(msg)
    err.yoo = { status: res.status, parameter: (data as any)?.parameter, type: (data as any)?.type, code: (data as any)?.code, response: data }
    throw err
  }
  return data
}

export async function yooCapturePayment(env: YooEnv, id: string, amount?: any, idemKey?: string) {
  const res = await fetchWithTimeout(`https://api.yookassa.ru/v3/payments/${id}/capture`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader(env),
      'Idempotence-Key': idemKey || cryptoRandomId()
    },
    body: JSON.stringify(amount ? { amount } : {}),
    timeoutMs: 20000
  })
  const data = await safeJson(res)
  if (!res.ok) {
    const msg = data?.description || `YooKassa error ${res.status}`
    const err: any = new Error(msg)
    err.yoo = { status: res.status, parameter: (data as any)?.parameter, type: (data as any)?.type, code: (data as any)?.code, response: data }
    throw err
  }
  return data
}

export async function safeJson(res: Response) {
  try { return await res.json() } catch { return {} }
}

export function cryptoRandomId(): string {
  // Prefer crypto.randomUUID if available
  if (typeof (globalThis as any).crypto?.randomUUID === 'function') {
    return (globalThis as any).crypto.randomUUID()
  }
  // Fallback: simple random
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}
