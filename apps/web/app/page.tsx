export default function Home() {
  const webappUrl = process.env.NEXT_PUBLIC_WEBAPP_URL || '/tg'
  const bot = ('https://t.me/AnonPaySubBot' )

  return (
    <main>
      {/* Hero */}
      <section className="hero">
        <div className="container hero__inner">
          <div className="hero__text">
            <div className="badge">
              <span className="badge__icon">📦</span>
              <span className="badge__text">BazarPayBot</span>
            </div>
            <h1 className="hero__title">Анонимная оплата онлайн‑подписок</h1>
            <p className="hero__subtitle">Без карт. Без границ. Всё прозрачно и безопасно — в стиле Telegram.</p>
            <div className="hero__cta" style={{textAlign: 'center', marginTop: '4rem'}}>
              <a className="btn-telegram" href={bot}>
                <span className="btn-telegram__icon">✈️</span>
                Запуск бота
              </a>
            </div>

            <div className="hero__meta">
              <span>🔒 Анонимно</span>
              <span>💳 Локальные способы оплаты</span>
              <span>⚡️ Автоматизация</span>
            </div>
          </div>

          <div className="hero__visual">
            <div className="float-emoji" style={{['--d' as any]: '0s'} as any}>💳</div>
            <div className="float-emoji" style={{['--d' as any]: '.6s'} as any}>🔐</div>
            <div className="float-emoji" style={{['--d' as any]: '1.2s'} as any}>🌍</div>
            <div className="float-emoji" style={{['--d' as any]: '1.8s'} as any}>⚡️</div>

            <div className="device-mock">
              <div className="chat-buble left">Здравствуйте! Хочу оформить подписку 👋</div>
              <div className="chat-buble right">Выберите сервис из списка 📃</div>
              <div className="chat-buble left">Отправляю данные для входа 🔑</div>
              <div className="chat-buble right">Оплатите удобным способом 💳</div>
              <div className="chat-buble right success">Готово! Подписка активирована ✅</div>
            </div>
          </div>
        </div>

        <div className="hero__bg" aria-hidden />
      </section>

      {/* Why */}
      <section className="container section" id="why">
        <h2 className="section__title">Почему BazarPayBot — это удобно</h2>
        <div className="features">
          <div className="feature">
            <span className="feature__icon">🛡️</span>
            <div className="feature__body">
              <div className="feature__title">Анонимность и безопасность</div>
              <div className="feature__desc">Данные защищены, контактов и лишних переписок — нет.</div>
            </div>
          </div>
          <div className="feature">
            <span className="feature__icon">💳</span>
            <div className="feature__body">
              <div className="feature__title">Локальные способы оплаты</div>
              <div className="feature__desc">Оплачивайте привычными способами — без валютных операций.</div>
            </div>
          </div>
          <div className="feature">
            <span className="feature__icon">⚙️</span>
            <div className="feature__body">
              <div className="feature__title">Автоматизация процесса</div>
              <div className="feature__desc">Заказ автоматически передаётся администратору.</div>
            </div>
          </div>
          <div className="feature">
            <span className="feature__icon">🔍</span>
            <div className="feature__body">
              <div className="feature__title">Прозрачная оплата</div>
              <div className="feature__desc">Чёткие суммы, понятные статусы и уведомления.</div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="container section" id="how">
        <h2 className="section__title">Как это работает</h2>
        <ol className="steps">
          <li className="step"><span className="step__num">1</span><div className="step__body"><div className="step__title">Выберите сервис</div><div className="step__desc">Список популярных площадок уже внутри.</div></div></li>
          <li className="step"><span className="step__num">2</span><div className="step__body"><div className="step__title">Вводите данные</div><div className="step__desc">Только то, что нужно для оформления.</div></div></li>
          <li className="step"><span className="step__num">3</span><div className="step__body"><div className="step__title">Оплачиваете локально</div><div className="step__desc">Локальные, понятные и быстрые способы.</div></div></li>
          <li className="step"><span className="step__num">4</span><div className="step__body"><div className="step__title">Автопередача заказа</div><div className="step__desc">Заявка у администратора без вашего контакта.</div></div></li>
          <li className="step"><span className="step__num">5</span><div className="step__body"><div className="step__title">Готово</div><div className="step__desc">Подписка активируется. Уведомление — в Telegram.</div></div></li>
        </ol>

        <div className="hero__cta" style={{display: 'flex', justifyContent: 'center', marginTop: '2rem'}}>
              <a className="btn-telegram" href={bot}>
                <span className="btn-telegram__icon">✈️</span>
                Запуск бота
              </a>
            </div>
         <p className="muted center" style={{marginTop: '2rem'}}>Для корректной работы откройте страницу из клиента Telegram.</p>
      </section>

      {/* Footer */}
      
    </main>
  )
}
