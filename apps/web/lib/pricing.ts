export type CalcRubOptions = {
  fx: number
  deltaRate?: number
  fixedFee?: number
}

// Итог (₽) = ceil( ( startprice × (fx + deltaRate) × (1 + 0.03 + 0.001×startprice) + fixedFee ) / 10 ) × 10
export function calcRubPrice(usd: number, options: CalcRubOptions): number {
  const fx = Number(options.fx)
  const start = Number(usd)
  if (!fx || fx <= 0 || !start || start <= 0) return 0
  const deltaRate = options.deltaRate ?? 4
  const fixedFee = options.fixedFee ?? 750
  const commission = 0.03 + 0.001 * start
  const base = start * (fx + deltaRate)
  const priceWithCommission = base * (1 + commission)
  const final = priceWithCommission + fixedFee
  return Math.ceil(final / 10) * 10
}
