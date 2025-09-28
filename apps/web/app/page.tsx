export default function Home() {
  const webappUrl = process.env.NEXT_PUBLIC_WEBAPP_URL || '/tg'
  const bot = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || ''
  return (
    <main className="container">
      <h1>OnlyFansBot</h1>
      <p>Откройте мини‑приложение из Telegram:</p>
      <ul>
        <li>Через бота: {bot ? <a href={`https://t.me/${bot.replace(/^@/, '')}`}>@{bot.replace(/^@/, '')}</a> : 'укажите @username бота в env'}</li>
        <li>Или прямо: <a href={webappUrl}>{webappUrl}</a></li>
      </ul>
      <p className="muted">Для корректной работы WebApp откройте страницу из клиента Telegram.</p>
    </main>
  )
}
