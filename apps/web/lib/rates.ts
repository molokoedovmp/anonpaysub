const TIMEOUT_MS = 3000

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { cache: 'no-store', signal: controller.signal })
    return res
  } finally {
    clearTimeout(t)
  }
}

const PROVIDERS = [
  async () => {
    const res = await fetchWithTimeout('https://api.exchangerate.host/latest?base=USD&symbols=RUB')
    if (!res.ok) throw new Error('bad status')
    const j = await res.json()
    const rate = j?.rates?.RUB
    if (typeof rate === 'number' && isFinite(rate) && rate > 0) return rate
    throw new Error('no rate')
  },
  async () => {
    const res = await fetchWithTimeout('https://open.er-api.com/v6/latest/USD')
    if (!res.ok) throw new Error('bad status')
    const j = await res.json()
    const rate = j?.rates?.RUB
    if (typeof rate === 'number' && isFinite(rate) && rate > 0) return rate
    throw new Error('no rate')
  }
]

export async function fetchUsdRubRate(): Promise<number> {
  let lastError: Error | undefined
  for (const provider of PROVIDERS) {
    try {
      return await provider()
    } catch (err: any) {
      lastError = err
    }
  }
  throw lastError ?? new Error('rate unavailable')
}
