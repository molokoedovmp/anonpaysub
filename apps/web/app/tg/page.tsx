"use client"
import { useEffect, useMemo, useRef, useState } from 'react'
import { calcRubPrice } from '@/lib/pricing'

declare global {
  interface Window {
    Telegram?: any
    TelegramGameProxy?: {
      receiveEvent?: (...args: any[]) => void
    }
  }
}

type Order = {
  service: string
  login: string
  password: string
  creatorUrl: string
  plan: string // 1m, 3m, 9m, 12m
  monthlyPriceUsd: number
  notes?: string
  paymentMethod: 'crypto' | 'yookassa' | 'other'
  telegramUserId?: number
  telegramUser?: {
    id: number
    first_name?: string
    last_name?: string
    username?: string
  }
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
  const [step, setStep] = useState<'info' | 'price' | 'confirm' | 'success'>('info')
  const [order, setOrder] = useState<Order>({
    service: 'ChatGpt',
    login: '',
    password: '',
    creatorUrl: '',
    plan: '1m',
    monthlyPriceUsd: 0,
    notes: '',
    paymentMethod: 'yookassa'
  })
  const [monthlyUsdInput, setMonthlyUsdInput] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [orderSent, setOrderSent] = useState(false)
  const [waitingInvoice, setWaitingInvoice] = useState(false)
  const [paidNotified, setPaidNotified] = useState(false)
  const [paymentId, setPaymentId] = useState<string | null>(null)
  const [result, setResult] = useState<string>('')
  const [usdToRub, setUsdToRub] = useState<number | null>(null)
  const paymentSlug = process.env.NEXT_PUBLIC_PAYMENT_SLUG
  const [telegramUserId, setTelegramUserId] = useState<number | undefined>(undefined)
  const [telegramUser, setTelegramUser] = useState<Order['telegramUser']>()

  const paymentMethodRef = useRef<Order['paymentMethod']>(order.paymentMethod)

  useEffect(() => {
    paymentMethodRef.current = order.paymentMethod
  }, [order.paymentMethod])

  function showAlertMessage(message: string) {
    const fallback = () => {
      if (typeof window !== 'undefined') window.alert(message)
    }
    try {
      if (tg?.showAlert) {
        tg.showAlert(message)
        return
      }
      if (tg?.showPopup) {
        tg.showPopup({ message })
        return
      }
    } catch {
      fallback()
      return
    }
    fallback()
  }

  function reportError(message: string, { inlineOnly = false }: { inlineOnly?: boolean } = {}) {
    setResult(message)
    if (!inlineOnly && paymentMethodRef.current !== 'other') {
      showAlertMessage(message)
    }
  }

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.TelegramGameProxy = window.TelegramGameProxy || { receiveEvent: () => {} }
    }
    const t = window.Telegram?.WebApp
    setTg(t)
    try {
      t?.expand?.()
      t?.MainButton?.hide?.()
      t?.ready?.()
    } catch {}
    const data = t?.initData || ''
    if (data) {
      setInitData(data)
    }
    const initUser = t?.initDataUnsafe?.user
    if (initUser?.id) {
      setTelegramUserId(initUser.id)
      setTelegramUser({
        id: initUser.id,
        first_name: initUser.first_name,
        last_name: initUser.last_name,
        username: initUser.username
      })
    }

    // Fallback: parse tgWebAppData from URL when running outside Telegram container
    if (!initUser?.id && typeof window !== 'undefined') {
      const tryExtract = () => {
        const candidates: string[] = []
        try {
          const search = new URLSearchParams(window.location.search)
          const fromSearch = search.get('tgWebAppData') || search.get('tgwebappdata')
          if (fromSearch) candidates.push(fromSearch)
        } catch {}
        try {
          const hash = window.location.hash?.replace(/^#/, '')
          if (hash) {
            const hashParams = new URLSearchParams(hash)
            const fromHash = hashParams.get('tgWebAppData') || hashParams.get('tgwebappdata')
            if (fromHash) candidates.push(fromHash)
          }
        } catch {}
        return candidates
      }

      const decodeInit = (raw: string) => {
        try {
          return decodeURIComponent(raw)
        } catch {
          return raw
        }
      }

      const parseInit = (raw: string) => {
        let userInjected = false
        try {
          const parsed = new URLSearchParams(raw)
          const userJson = parsed.get('user')
          if (userJson) {
            const parsedUser = JSON.parse(userJson)
            const numericId = Number(parsedUser?.id)
            if (Number.isFinite(numericId)) {
              setTelegramUserId(numericId)
              setTelegramUser({
                id: numericId,
                first_name: parsedUser.first_name,
                last_name: parsedUser.last_name,
                username: parsedUser.username
              })
              userInjected = true
            }
          }
        } catch {}
        return userInjected
      }

      const candidates = tryExtract()
      for (const candidate of candidates) {
        const decoded = decodeInit(candidate)
        if (!initData) setInitData(decoded)
        const userFound = parseInit(decoded)
        if (userFound) break
      }
    }

    // fetch live USD->RUB
    fetch('/api/rates/usd-rub').then(async (r) => {
      try {
        const j = await r.json()
        if (j?.rate) setUsdToRub(Number(j.rate))
      } catch {}
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!tg?.onEvent) return
    const handler = (eventType: string, eventData: any) => {
      if (eventType === 'invoiceClosed') {
        setWaitingInvoice(false)
        if (eventData?.status === 'paid') {
          tg?.HapticFeedback?.notificationOccurred?.('success')
          void notifyPaid()
          setStep('success')
        } else {
          const message = 'Оплата не завершена. Если хотите попробовать снова, нажмите «Оплатить» ещё раз.'
          if (paymentMethodRef.current !== 'other') {
            showAlertMessage(message)
          }
          setResult(message)
        }
      }
    }
    tg.onEvent('invoiceClosed', handler)
    return () => tg.offEvent?.('invoiceClosed', handler)
  }, [tg])

  useEffect(() => {
    setPaidNotified(false)
    setPaymentId(null)
  }, [order.paymentMethod])

  useEffect(() => {
    if (!paymentId || !waitingInvoice) return
    let cancelled = false
    const interval = setInterval(async () => {
      try {
        console.log('Checking payment status for:', paymentId)
        const res = await fetch(`/api/yookassa/${paymentId}`)
        if (!res.ok) {
          console.warn('Payment status check failed:', res.status)
          return
        }
        const data = await res.json()
        console.log('Payment status response:', data)
        if ((data?.status === 'succeeded' || data?.status === 'waiting_for_capture') && !cancelled) {
          console.log('Payment succeeded, notifying...')
          clearInterval(interval)
          setWaitingInvoice(false)
          tg?.HapticFeedback?.notificationOccurred?.('success')
          await notifyPaid()
          setStep('success')
          setPaymentId(null)
        } else if (data?.status === 'canceled' && !cancelled) {
          console.log('Payment canceled')
          clearInterval(interval)
          setWaitingInvoice(false)
          reportError('Оплата не завершена. Попробуйте ещё раз.')
          setPaymentId(null)
        }
      } catch (err) {
        console.error('yookassa status error', err)
      }
    }, 4000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [paymentId, waitingInvoice])

  const months = useMemo(() => ({ '1m': 1, '3m': 3, '9m': 9, '12m': 12 }[order.plan] ?? 1), [order.plan])

  const calc = useMemo(() => {
    const rate = usdToRub && usdToRub > 0 ? usdToRub : 0
    const monthlyUsd = Math.max(0, Number(order.monthlyPriceUsd) || 0)
    const totalUsd = monthlyUsd * months
    const deltaRate = 4
    const fixedFee = 750
    const baseRub = totalUsd * (rate + deltaRate)
    const totalRub = totalUsd > 0 && rate > 0 ? calcRubPrice(totalUsd, { fx: rate, deltaRate, fixedFee }) : 0
    const commissionRub = Math.max(0, totalRub - baseRub)
    const commissionPctDisplay = baseRub > 0 ? (commissionRub / baseRub) : 0
    return { usdToRub: rate, commissionPct: commissionPctDisplay, months, baseUsd: totalUsd, baseRub, commissionRub, totalRub }
  }, [order.monthlyPriceUsd, months, usdToRub])

  const canInfo = useMemo(() => !!order.service && !!order.login && !!order.password && !!order.creatorUrl, [order])
  const canPrice = useMemo(() => Number((monthlyUsdInput || '').replace(',', '.')) > 0, [monthlyUsdInput])
  const canSubmit = useMemo(() => canInfo && canPrice, [canInfo, canPrice])

  function goToPrice() {
    if (!canInfo) {
      setResult('Заполните сервис, логин, пароль и ссылку на автора')
      return
    }
    setResult('')
    setStep('price')
  }

  function goToConfirm() {
    if (!canPrice) {
      setResult('Укажите стоимость подписки в USD')
      return
    }
    setResult('')
    setStep('confirm')
    setWaitingInvoice(false)
    setPaymentId(null)
  }

  function goBackToInfo() {
    setResult('')
    setWaitingInvoice(false)
    setOrderSent(false)
    setPaidNotified(false)
    setPaymentId(null)
    setStep('info')
  }

  function goBackToPrice() {
    setResult('')
    setWaitingInvoice(false)
    setOrderSent(false)
    setPaidNotified(false)
    setPaymentId(null)
    setStep('price')
  }

  async function notifyPaid() {
    if (paidNotified || order.paymentMethod === 'other') return
    try {
      console.log('Notifying paid order:', { order, calc, initData })
      const cleanOrder = { ...order, notes: order.notes?.trim() || '' }
      if (telegramUserId) cleanOrder.telegramUserId = telegramUserId
      if (telegramUser) cleanOrder.telegramUser = telegramUser
      const response = await fetch('/api/orders/paid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData, order: { ...cleanOrder, calc } })
      })
      const result = await response.json()
      console.log('Notify paid response:', { status: response.status, result })
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to notify')
      }
      setPaidNotified(true)
    } catch (e) {
      console.error('notifyPaid failed', e)
      showAlertMessage('❗️ Не удалось автоматически уведомить менеджера. Пожалуйста, напишите нам в чате, чтобы мы проверили оплату.')
    }
  }

  async function submitOrder(): Promise<boolean> {
    if (orderSent) return true
    setSubmitting(true)
    setResult('')
    try {
      const cleanOrder = { ...order, notes: order.notes?.trim() || '' }
      if (telegramUserId) cleanOrder.telegramUserId = telegramUserId
      if (telegramUser) cleanOrder.telegramUser = telegramUser
      const res = await fetch('/api/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData, order: { ...cleanOrder, calc } })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Ошибка')
      tg?.HapticFeedback?.notificationOccurred?.('light')
      setOrderSent(true)
      return true
    } catch (e: any) {
      reportError(e.message || 'Не удалось отправить заказ')
      tg?.HapticFeedback?.notificationOccurred?.('error')
      return false
    } finally {
      setSubmitting(false)
    }
  }

  async function handlePay() {
    if (!canSubmit) {
      reportError('Заполните все обязательные поля', { inlineOnly: true })
      return
    }
    setResult('')
    const ok = await submitOrder()
    if (!ok) return

    if (order.paymentMethod === 'crypto') {
      if (!paymentSlug || !tg?.openInvoice) {
        reportError('Оплата картой через Telegram не настроена. Укажите NEXT_PUBLIC_PAYMENT_SLUG и перезапустите приложение.')
        return
      }
      try {
        setWaitingInvoice(true)
        tg.openInvoice(paymentSlug)
      } catch (err: any) {
        setWaitingInvoice(false)
        reportError(err?.message || 'Не удалось открыть платёжную форму. Попробуйте позже.')
      }
      return
    }

    if (order.paymentMethod === 'yookassa') {
      try {
        setWaitingInvoice(true)
        console.log('Creating YooKassa payment:', { order, calc })
        const res = await fetch('/api/yookassa/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            initData,
            order: {
              ...order,
              calc,
              telegramUserId,
              telegramUser
            }
          })
        })
        const data = await res.json()
        console.log('YooKassa create response:', { status: res.status, data })
        if (!res.ok) throw new Error(data?.error || 'Не удалось создать оплату')
        setPaymentId(data.paymentId)
        try { localStorage.setItem('yoo_payment', JSON.stringify({ id: data.paymentId, ts: Date.now() })) } catch {}
        const link = data.confirmationUrl
        if (link) {
          // Пытаемся открыть ссылку через Telegram WebApp API
          console.log('Attempting to open link:', link)
          console.log('Telegram WebApp available:', !!tg)
          console.log('openLink available:', !!tg?.openLink)
          
          if (tg?.openLink) {
            try {
              console.log('Using tg.openLink')
              tg.openLink(link)
            } catch (err) {
              console.warn('Failed to open link via Telegram API:', err)
              // Fallback к обычному открытию
              window.open(link, '_blank')
            }
          } else if (tg?.openTelegramLink) {
            try {
              console.log('Using tg.openTelegramLink')
              tg.openTelegramLink(link)
            } catch (err) {
              console.warn('Failed to open link via Telegram Link API:', err)
              window.open(link, '_blank')
            }
          } else {
            console.log('Using window.open fallback')
            // Fallback к обычному открытию
            window.open(link, '_blank')
          }
          // Дополнительный fallback для некоторых клиентов iOS/Android
          setTimeout(() => {
            try {
              if (document.visibilityState === 'visible') {
                window.location.href = link
              }
            } catch {}
          }, 1000)
        }
      } catch (err: any) {
        setWaitingInvoice(false)
        reportError(err?.message || 'Не удалось открыть платёжную форму ЮKassa. Попробуйте позже.')
      }
      return
    }

    // order.paymentMethod === 'other'
    setWaitingInvoice(false)
      tg?.HapticFeedback?.notificationOccurred?.('success')
      setStep('success')
  }

  const trimmedNotes = order.notes?.trim()
  const planLabels: Record<string, string> = {
    '1m': '1 месяц',
    '3m': '3 месяца',
    '9m': '9 месяцев',
    '12m': '12 месяцев'
  }

  
  const normalizedServiceKey = order.service?.toLowerCase() || ''
  const defaultServiceTitle = !order.service ? 'Другое' : order.service
  const serviceInfo = { title: defaultServiceTitle, subtitle: 'Подписка', emoji: '🛒' }

  return (
    <main className="container">
      <div className="app-header">
        <span className="app-header__emoji">🕶️</span>
        <div className="app-header__text">
          <h2>Анонимная оплата подписки </h2>
          <p className="muted">Оформите заказ без переписок — мы оплатим и сообщим о статусе.</p>
        </div>
      </div>
      {step === 'info' && (
        <div className="step-card">
          <div className="step-card__header">
            <span className="muted">Шаг 1 из 3</span>
            <h3 className="step-card__title"><span className="step-card__emoji">👤</span>Данные аккаунта</h3>
          </div>
          <div className="step-card__section">
            <label>Сервис</label>
            <div className="service-input">
              <input
                list="service-suggestions"
                value={order.service}
                onChange={(e) => setOrder(o => ({ ...o, service: e.target.value }))}
              />
            </div>
          </div>
          <div className="step-card__grid">
            <div className="step-card__section">
              <label>Логин</label>
              <input placeholder="Логин или email" value={order.login} onChange={(e) => setOrder(o => ({...o, login: e.target.value}))} />
            </div>
            <div className="step-card__section">
              <label>Пароль (не используйте от основных аккаунтов)</label>
              <input type="password" placeholder="Пароль аккаунта" value={order.password} onChange={(e) => setOrder(o => ({...o, password: e.target.value}))} />
            </div>
          </div>
          <div className="step-card__section">
            <label>Ссылка на оплачиваемый сервис или автора</label>
            <input placeholder="https://openai.com" value={order.creatorUrl} onChange={(e) => setOrder(o => ({...o, creatorUrl: e.target.value}))} />
          </div>
          <p className="muted">Проверьте данные — при ошибке оплатить подписку не получится.</p>
          {(!waitingInvoice && order.paymentMethod === 'other' && !!result) && (
            <p className="danger">{result}</p>
          )}
          <div className="step-card__actions">
            <button type="button" className="btn-primary" onClick={goToPrice} disabled={!canInfo || submitting}>Перейти к стоимости</button>
          </div>
        </div>
      )}

      {step === 'price' && (
        <div className="step-card">
          <div className="step-card__header">
            <span className="muted">Шаг 2 из 3</span>
            <h3 className="step-card__title"><span className="step-card__emoji">💵</span>Стоимость подписки</h3>
          </div>
          <div className="step-card__grid">
            <div className="step-card__section">
              <label>Тариф</label>
              <select value={order.plan} onChange={(e) => setOrder(o => ({...o, plan: e.target.value}))}>
                <option value="1m">1 месяц</option>
                <option value="3m">3 месяца</option>
                <option value="9m">9 месяцев</option>
                <option value="12m">12 месяцев</option>
              </select>
            </div>
            <div className="step-card__section">
              <label>Цена в месяц (USD)</label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="30"
                value={monthlyUsdInput}
                onChange={(e) => {
                  const v = e.target.value
                  const norm = v.replace(',', '.')
                  setMonthlyUsdInput(v)
                  const num = Number(norm)
                  setOrder(o => ({ ...o, monthlyPriceUsd: Number.isFinite(num) ? num : 0 }))
                }}
              />
            </div>
          </div>
          <div className="step-card__section price-summary">
            <div className="price-summary__line"><span>Курс</span><span>{usdToRub && usdToRub > 0 ? `1 USD = ${usdToRub.toFixed(2)} ₽` : '—'}</span></div>
            <div className="price-summary__line"><span>Срок</span><span>{months} мес.</span></div>
            <div className="price-summary__line"><span>Базовая сумма</span><span>{usdToRub && usdToRub > 0 ? `${Math.ceil(calc.baseRub).toLocaleString('ru-RU')} ₽` : '—'}</span></div>
            <div className="price-summary__line"><span>Комиссия {Math.round((calc.commissionPct || 0) * 100)}%</span><span>{usdToRub && usdToRub > 0 ? `${Math.ceil(calc.commissionRub).toLocaleString('ru-RU')} ₽` : '—'}</span></div>
            <div className="price-summary__total"><span>Итого к оплате</span><span>{usdToRub && usdToRub > 0 ? `${calc.totalRub.toLocaleString('ru-RU')} ₽` : '—'}</span></div>
          </div>
          <div className="step-card__section">
            <label>Примечание</label>
            <textarea rows={3} placeholder="Доп. информация (по желанию)" value={order.notes} onChange={(e) => setOrder(o => ({...o, notes: e.target.value}))} />
          </div>
          {result && <p className="danger">{result}</p>}
          <div className="step-card__actions">
            <button type="button" className="btn-secondary" onClick={goBackToInfo} disabled={submitting}>Назад</button>
            <button type="button" className="btn-primary" disabled={!canPrice || submitting} onClick={goToConfirm}>Перейти к оплате</button>
          </div>
        </div>
      )}

      {step === 'confirm' && (
        <div className="card col">
          <div className="invoice-header">
            <span className="muted">Шаг 3 из 3 — подтверждение</span>
            <h3 className="invoice-title">💳 Оплатить</h3>
          </div>
          <div className="invoice-card">
            <div className="invoice-card__emoji">{serviceInfo.emoji}</div>
            <div className="invoice-card__body">
              <div className="invoice-card__title">Заказ на подписку</div>
              <div className="invoice-card__subtitle">{serviceInfo.title}</div>
              <div className="invoice-card__note">{serviceInfo.subtitle}</div>
            </div>
            <div className="invoice-card__total">{usdToRub && usdToRub > 0 ? `${calc.totalRub.toLocaleString('ru-RU')} ₽` : '—'}</div>
          </div>

          <div className="invoice-section">
            <div className="invoice-row">
              <span>Логин</span>
              <span>{order.login}</span>
            </div>
            <div className="invoice-row">
              <span>Пароль</span>
              <span>{order.password}</span>
            </div>
            <div className="invoice-row">
              <span>Автор</span>
              <span>{order.creatorUrl}</span>
            </div>
            <div className="invoice-row">
              <span>Тариф</span>
              <span>{planLabels[order.plan] ?? `${months} мес.`}</span>
            </div>
            <div className="invoice-row">
              <span>Цена/мес</span>
              <span>{order.monthlyPriceUsd} USD</span>
            </div>
            <div className="invoice-row invoice-row__total">
              <span>Итого</span>
              <span>{usdToRub && usdToRub > 0 ? `${calc.totalRub.toLocaleString('ru-RU')} ₽` : '—'}</span>
            </div>
          </div>

          {/* <div className="invoice-list">
            <div className="invoice-list__item">
              <span className="invoice-list__label">Способ оплаты</span>
              <span className="invoice-list__value">{order.paymentMethod === 'crypto' ? 'Оплата картой' : order.paymentMethod === 'yookassa' ? 'Оплата через ЮKassa' : 'Связь с менеджером'}</span>
            </div>
          </div> */}

          <div className="payment-options">
            {[
              { value: 'crypto', label: 'Оплата через Telegram ⭐️', description: 'Быстрая оплата звездами внутри Telegram' },
              { value: 'yookassa', label: 'Оплата через ЮKassa', description: 'Оплата банковской картой' },
            ].map((opt) => (
              <button
                type="button"
                key={opt.value}
                className={`payment-option${order.paymentMethod === opt.value ? ' payment-option--active' : ''}`}
                onClick={() => {
                  setResult('')
                  setOrder(o => ({ ...o, paymentMethod: opt.value as Order['paymentMethod'] }))
                }}
                disabled={waitingInvoice}
              >
            <span className="payment-option__title">{opt.label}</span>
                <span className="payment-option__desc">{opt.description}</span>
              </button>
            ))}
          </div>

          {trimmedNotes && (
            <div className="invoice-notes">
              <div className="muted">Примечание</div>
              <div>{trimmedNotes}</div>
            </div>
          )}
          <p className="muted">Если логин или пароль указаны неверно, оплатить подписку не получится. Проверьте данные перед оплатой.</p>
          {!waitingInvoice && order.paymentMethod === 'other' && !!result && <p className="danger">{result}</p>}

          <div className="invoice-actions">
            <button type="button" className="invoice-back" onClick={goBackToPrice} disabled={submitting || waitingInvoice}>Назад</button>
            <button type="button" className="invoice-pay" onClick={handlePay} disabled={submitting || waitingInvoice}>
              {waitingInvoice
                ? 'Ожидаем оплату…'
                : order.paymentMethod !== 'other'
                  ? `Оплатить ${usdToRub && usdToRub > 0 ? `${calc.totalRub.toLocaleString('ru-RU')} ₽` : ''}`
                  : 'Отправить заявку'}
            </button>
          </div>
          {/* скрываем текстовые блоки и ссылки — только спиннер и кнопки */}
          {/* без лишних ссылок/кнопок — ждём завершения оплаты */}
        </div>
      )}

      {step === 'success' && (
        <div className="card col" style={{alignItems: 'center', textAlign: 'center'}}>
          <div className="success-anim">
            <div className="success-anim__circle" />
            <div className="success-anim__check" />
          </div>
          <h3>Оплата прошла</h3>
          <p>Подписка будет оформлена в течение 15–60 минут. Если потребуется дополнительная информация, мы свяжемся с вами.</p>
          <button
            type="button"
            onClick={() => {
              if (tg?.close) {
                tg.close()
              } else {
                setWaitingInvoice(false)
                setOrderSent(false)
                setPaidNotified(false)
                setResult('')
                setStep('info')
              }
            }}
          >
            Закрыть
          </button>
        </div>
      )}
    </main>
  )
}
