import React from 'react'

export default function LegalPage({
  title,
  subtitle,
  children,
}: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <main className="container" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h1 style={{ margin: 0 }}>{title}</h1>
        {subtitle ? <p className="muted" style={{ margin: 0 }}>{subtitle}</p> : null}
      </div>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {children}
      </div>
    </main>
  )
}

