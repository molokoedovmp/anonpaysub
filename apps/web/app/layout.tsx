import type  {Metadata}  from 'next'
import './globals.css'

const supportUrl = 'https://t.me/aibazaru'

export const metadata: Metadata = {
  title: 'BazarPayBot',
  description: 'Telegram WebApp for anonymous subscription orders'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        {children}
        <footer className="footer">
        <div className="footer__bg" aria-hidden />
        <div className="container footer__inner">
          <div className="footer__grid">
            <div className="footer__brand">
              <div className="badge" aria-label="AnonPayBot">
                <span className="badge__icon">📦</span>
                <span className="badge__text">BazarPayBot</span>
              </div>
              <p className="muted">Инструмент для анонимной и удобной оплаты онлайн‑подписок.</p>
              
            </div>

            <nav className="footer__col">
              <div className="footer__title">Документы</div>
              <ul className="footer__links">
                <li><a className="footer__link" href="/privacy">Политика конфиденциальности</a></li>
                <li><a className="footer__link" href="/offer">Публичная оферта</a></li>
              </ul>
            </nav>

            <div className="footer__col">
              <div className="footer__title">Поддержка</div>
              <ul className="footer__links">
                <li><a className="footer__link" href={supportUrl}>Telegram поддержка</a></li>
              </ul>
            </div>
          </div>

          <div className="footer__line" />
          <div className="footer__meta">
            <span>© {new Date().getFullYear()} BazarPayBot</span>
            <span className="muted">Открывайте WebApp из клиента Telegram для корректной работы.</span>
          </div>
        </div>
      </footer>
      </body>
    </html>
  )
}
