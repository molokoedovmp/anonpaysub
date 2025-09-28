"use client"
import { useEffect, useMemo, useState } from 'react'

declare global {
  interface Window { Telegram?: any }
}

type Order = {
  service: string
  login: string
  password: string
  creatorUrl: string
  plan: string // 1m, 3m, 9m, 12m
  monthlyPriceUsd: number
  notes?: string
  paymentMethod: 'crypto' | 'other'
  calc?: {
    usdToRub: number
    commissionPct: number
    months: number
    baseUsd: number
    baseRub: number
    commissionRub: number
    totalRub: number
  }
}

export default function TgPage() {
  const [tg, setTg] = useState<any>(null)
  const [initData, setInitData] = useState<string>('')
  const [order, setOrder] = useState<Order>({
    service: 'onlyfans',
    login: '',
    password: '',
    creatorUrl: '',
    plan: '1m',
    monthlyPriceUsd: 0,
    notes: '',
    paymentMethod: 'crypto'
  })
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<string>('')
  const [usdToRub, setUsdToRub] = useState<number | null>(null)

  useEffect(() => {
    const t = window.Telegram?.WebApp
    setTg(t)
    try {
      t?.expand?.()
    } catch {}
    const data = t?.initData || ''
    setInitData(data)
    t?.MainButton?.setParams?.({ text: 'Отправить заказ' })
    t?.MainButton?.show?.()
    const onClick = () => handleSubmit()
    t?.onEvent?.('mainButtonClicked', onClick)
    // fetch live USD->RUB
    fetch('/api/rates/usd-rub').then(async (r) => {
      try {
        const j = await r.json()
        if (j?.rate) setUsdToRub(Number(j.rate))
      } catch {}
    }).catch(() => {})
    return () => t?.offEvent?.('mainButtonClicked', onClick)
  }, [])

  const commissionPct = 0.25

  const months = useMemo(() => ({ '1m': 1, '3m': 3, '9m': 9, '12m': 12 }[order.plan] ?? 1), [order.plan])

  const calc = useMemo(() => {
    const rate = usdToRub && usdToRub > 0 ? usdToRub : 0
    const baseUsd = Math.max(0, Number(order.monthlyPriceUsd) || 0) * months
    const baseRub = baseUsd * rate
    const commissionRub = Math.ceil(baseRub * commissionPct)
    const totalRub = Math.ceil(baseRub + commissionRub)
    return { usdToRub: rate, commissionPct, months, baseUsd, baseRub, commissionRub, totalRub }
  }, [order.monthlyPriceUsd, months, usdToRub, commissionPct])

  const canSubmit = useMemo(() => !!order.service && !!order.login && !!order.password && !!order.creatorUrl && order.monthlyPriceUsd > 0, [order])

  async function handleSubmit() {
    if (!canSubmit) {
      setResult('Заполните все обязательные поля')
      return
    }
    setSubmitting(true)
    setResult('')
    try {
      const res = await fetch('/api/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData, order: { ...order, calc } })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Ошибка')
      setResult('Заказ отправлен. Мы свяжемся при необходимости.')
      tg?.HapticFeedback?.notificationOccurred?.('success')
    } catch (e: any) {
      setResult(e.message || 'Не удалось отправить заказ')
      tg?.HapticFeedback?.notificationOccurred?.('error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="container">
      <h2>Анонимная оплата подписки</h2>
      <div className="card col">
        <div className="col">
          <label>Сервис</label>
          <select value={order.service} onChange={(e) => setOrder(o => ({...o, service: e.target.value}))}>
            <option value="onlyfans">OnlyFans</option>
            <option value="patreon">Patreon</option>
            <option value="fansly">Fansly</option>
          </select>
        </div>
        <div className="col">
          <label>Логин</label>
          <input placeholder="@username или email" value={order.login} onChange={(e) => setOrder(o => ({...o, login: e.target.value}))} />
        </div>
        <div className="col">
          <label>Пароль</label>
          <input type="password" placeholder="Пароль аккаунта" value={order.password} onChange={(e) => setOrder(o => ({...o, password: e.target.value}))} />
          <span className="muted">Данные передаются администратору для оплаты. Не используйте этот пароль где‑либо ещё.</span>
        </div>
        <div className="col">
          <label>Ссылка на автора</label>
          <input placeholder="https://onlyfans.com/creator" value={order.creatorUrl} onChange={(e) => setOrder(o => ({...o, creatorUrl: e.target.value}))} />
        </div>
        <div className="row">
          <div className="col" style={{flex: 1}}>
            <label>Тариф</label>
            <select value={order.plan} onChange={(e) => setOrder(o => ({...o, plan: e.target.value}))}>
              <option value="1m">1 месяц</option>
              <option value="3m">3 месяца</option>
              <option value="9m">9 месяцев</option>
              <option value="12m">12 месяцев</option>
            </select>
          </div>
          <div className="col" style={{width: 200}}>
            <label>Цена в месяц (USD)</label>
            <input type="number" placeholder="20" value={order.monthlyPriceUsd}
              onChange={(e) => setOrder(o => ({...o, monthlyPriceUsd: Number(e.target.value)}))} />
          </div>
        </div>

        <div className="col">
          <label>Расчёт стоимости (RUB)</label>
          <div className="row" style={{flexWrap:'wrap', gap: '8px 16px'}}>
            <div>Курс: {usdToRub && usdToRub > 0 ? `1 USD = ${usdToRub.toFixed(2)} ₽` : 'получаем...'}</div>
            <div>Месяцев: {months}</div>
            <div>База: {usdToRub && usdToRub > 0 ? `${calc.baseRub.toFixed(0)} ₽` : '—'}</div>
            <div>Комиссия ({(commissionPct*100).toFixed(0)}%): {usdToRub && usdToRub > 0 ? `${calc.commissionRub.toFixed(0)} ₽` : '—'}</div>
            <div><b>Итого к оплате: {usdToRub && usdToRub > 0 ? `${calc.totalRub.toFixed(0)} ₽` : '—'}</b></div>
          </div>
          <span className="muted">Комиссия {Math.round(commissionPct * 100)}% от суммы.</span>
        </div>
        <div className="col">
          <label>Примечание</label>
          <textarea rows={3} placeholder="Доп. информация" value={order.notes} onChange={(e) => setOrder(o => ({...o, notes: e.target.value}))} />
        </div>
        <div className="col">
          <label>Оплата</label>
          <select value={order.paymentMethod} onChange={(e) => setOrder(o => ({...o, paymentMethod: e.target.value as any}))}>
            <option value="crypto">Crypto / TON (реком.)</option>
            <option value="other">Другое (договоримся)</option>
          </select>
          <span className="muted">Оплата в приложении будет добавлена. Сейчас — заявка с суммой.</span>
        </div>
        <button disabled={!canSubmit || submitting} onClick={handleSubmit}>
          {submitting ? 'Отправка...' : 'Отправить заказ'}
        </button>
        {result && <p>{result}</p>}
      </div>
    </main>
  )
}
