'use client'

export default function Topbar({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{
      height: 56, borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', padding: '0 24px',
      background: 'white', position: 'sticky', top: 0, zIndex: 40
    }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{subtitle}</div>}
      </div>
    </div>
  )
}
