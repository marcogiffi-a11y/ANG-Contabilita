'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const UTENTI = [
  { nome: 'Marco', pin: '1507', ruolo: 'admin' },
  { nome: 'Amministrativa', pin: '2024', ruolo: 'editor' },
  { nome: 'Utente 3', pin: '3000', ruolo: 'editor' },
  { nome: 'Utente 4', pin: '4000', ruolo: 'viewer' },
]

export default function LoginPage() {
  const router = useRouter()
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const utente = UTENTI.find(u => u.pin === pin)
    if (utente) {
      sessionStorage.setItem('ang_conta_session', JSON.stringify(utente))
      router.push('/dashboard')
    } else {
      setError('PIN non valido')
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)'
    }}>
      <div style={{ width: 340 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 56, height: 56, background: 'var(--accent)', borderRadius: 14,
            marginBottom: 16
          }}>
            <span style={{ color: 'white', fontSize: 22, fontWeight: 800 }}>A</span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>ANG Contabilità</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Athena Next Gen S.r.l.</div>
        </div>

        {/* Form */}
        <div className="card" style={{ padding: 28 }}>
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 8 }}>
                PIN di accesso
              </label>
              <input
                type="password"
                value={pin}
                onChange={e => setPin(e.target.value)}
                placeholder="••••"
                maxLength={6}
                autoFocus
                style={{
                  width: '100%', padding: '11px 14px',
                  border: `1px solid ${error ? 'var(--red)' : 'var(--border)'}`,
                  borderRadius: 8, fontSize: 20, letterSpacing: 6,
                  textAlign: 'center', outline: 'none',
                  background: 'white'
                }}
              />
              {error && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 6 }}>{error}</div>}
            </div>
            <button type="submit" className="btn-primary" style={{ width: '100%', padding: 12 }} disabled={loading || !pin}>
              {loading ? 'Accesso...' : '→ ACCEDI'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
