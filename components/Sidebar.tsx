'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/dashboard', icon: '◈', label: 'Dashboard' },
  { href: '/prima-nota', icon: '≡', label: 'Prima Nota' },
  { href: '/fatture', icon: '◻', label: 'Fatture' },
]

export default function Sidebar() {
  const path = usePathname()

  return (
    <aside style={{
      width: 'var(--sidebar-w)', minHeight: '100vh',
      background: 'var(--accent)', display: 'flex', flexDirection: 'column',
      position: 'fixed', top: 0, left: 0, zIndex: 50
    }}>
      {/* Logo */}
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid rgba(255,255,255,.1)' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'white', letterSpacing: '.02em' }}>ANG Contabilità</div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', marginTop: 2 }}>Athena Next Gen S.r.l.</div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 10px' }}>
        {NAV.map(item => {
          const active = path === item.href || path.startsWith(item.href + '/')
          return (
            <Link key={item.href} href={item.href} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 12px', borderRadius: 8, marginBottom: 2,
              background: active ? 'rgba(255,255,255,.15)' : 'transparent',
              color: active ? 'white' : 'rgba(255,255,255,.6)',
              textDecoration: 'none', fontSize: 13, fontWeight: active ? 600 : 400,
              transition: 'all .15s'
            }}>
              <span style={{ fontSize: 15 }}>{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,.1)', fontSize: 11, color: 'rgba(255,255,255,.4)' }}>
        v0.1.0
      </div>
    </aside>
  )
}
