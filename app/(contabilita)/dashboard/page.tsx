'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Topbar from '@/components/Topbar'

const fmt = (n: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
const fmtFull = (n: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n)

const MESI = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']

export default function DashboardPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    saldo_fideuram: 0,
    saldo_unicredit: 0,
    spese_anno: 0,
    entrate_anno: 0,
    spese_mese: 0,
    entrate_mese: 0,
    liquidita_stimata: 0,
  })
  const [ultimi, setUltimi] = useState<any[]>([])

  const annoCorrente = new Date().getFullYear()
  const meseCorrente = MESI[new Date().getMonth()]

  useEffect(() => {
    async function load() {
      setLoading(true)

      // Tutti i movimenti dell'anno corrente
      const { data: movimenti } = await supabase
        .from('prima_nota')
        .select('importo, flusso, cassa, mese, anno')
        .eq('anno', annoCorrente)

      if (movimenti) {
        const spese_anno = movimenti.filter(m => m.flusso === 'USCITE').reduce((s, m) => s + Math.abs(m.importo), 0)
        const entrate_anno = movimenti.filter(m => m.flusso === 'ENTRATE').reduce((s, m) => s + m.importo, 0)
        const spese_mese = movimenti.filter(m => m.flusso === 'USCITE' && m.mese === meseCorrente).reduce((s, m) => s + Math.abs(m.importo), 0)
        const entrate_mese = movimenti.filter(m => m.flusso === 'ENTRATE' && m.mese === meseCorrente).reduce((s, m) => s + m.importo, 0)

        // Saldi per cassa (approssimazione: entrate - uscite)
        const saldo_fideuram = movimenti
          .filter(m => m.cassa === 'FIDEURAM')
          .reduce((s, m) => s + m.importo, 0)
        const saldo_unicredit = movimenti
          .filter(m => m.cassa === 'UNICREDIT')
          .reduce((s, m) => s + m.importo, 0)

        // Liquidità stimata: media mensile proiettata
        const mesiPassati = new Date().getMonth() + 1
        const media_mensile_netta = (entrate_anno - spese_anno) / mesiPassati
        const mesi_rimanenti = 12 - mesiPassati
        const liquidita_stimata = (saldo_fideuram + saldo_unicredit) + (media_mensile_netta * mesi_rimanenti)

        setStats({ saldo_fideuram, saldo_unicredit, spese_anno, entrate_anno, spese_mese, entrate_mese, liquidita_stimata })
      }

      // Ultimi 10 movimenti
      const { data: recenti } = await supabase
        .from('prima_nota')
        .select('id, data_contabile, descrizione, importo, flusso, cassa, macro_categoria')
        .order('data_contabile', { ascending: false })
        .limit(10)

      setUltimi(recenti || [])
      setLoading(false)
    }
    load()
  }, [])

  const KPI = [
    {
      label: 'Saldo Fideuram',
      value: fmt(stats.saldo_fideuram),
      sub: 'Conto principale',
      color: stats.saldo_fideuram >= 0 ? 'var(--green)' : 'var(--red)',
      bg: stats.saldo_fideuram >= 0 ? 'var(--green-light)' : 'var(--red-light)',
      icon: '🏦'
    },
    {
      label: 'Saldo Unicredit',
      value: fmt(stats.saldo_unicredit),
      sub: 'Conto secondario',
      color: stats.saldo_unicredit >= 0 ? 'var(--green)' : 'var(--red)',
      bg: stats.saldo_unicredit >= 0 ? 'var(--green-light)' : 'var(--red-light)',
      icon: '🏦'
    },
    {
      label: `Spese ${annoCorrente}`,
      value: fmt(stats.spese_anno),
      sub: `Entrate: ${fmt(stats.entrate_anno)}`,
      color: 'var(--red)',
      bg: 'var(--red-light)',
      icon: '📉'
    },
    {
      label: `Spese ${meseCorrente}`,
      value: fmt(stats.spese_mese),
      sub: `Entrate: ${fmt(stats.entrate_mese)}`,
      color: 'var(--yellow)',
      bg: 'var(--yellow-light)',
      icon: '📅'
    },
    {
      label: 'Liquidità Stimata',
      value: fmt(stats.liquidita_stimata),
      sub: 'Proiezione fine anno',
      color: stats.liquidita_stimata >= 0 ? 'var(--green)' : 'var(--red)',
      bg: stats.liquidita_stimata >= 0 ? 'var(--green-light)' : 'var(--red-light)',
      icon: '🔮'
    },
  ]

  return (
    <>
      <Topbar title="Dashboard" subtitle={`Anno ${annoCorrente}`} />
      <div style={{ padding: 24 }}>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>
            <div className="spinner" style={{ margin: '0 auto 12px' }} />
            <div>Caricamento dati...</div>
          </div>
        ) : (
          <>
            {/* KPI Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 28 }}>
              {KPI.map(k => (
                <div key={k.label} className="card" style={{ padding: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{k.label}</div>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: k.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{k.icon}</div>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: k.color, marginBottom: 4 }}>{k.value}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{k.sub}</div>
                </div>
              ))}
            </div>

            {/* Ultimi movimenti */}
            <div className="card">
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
                Ultimi movimenti
              </div>
              {ultimi.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                  Nessun movimento — importa il primo estratto conto dalla sezione Prima Nota
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Data', 'Descrizione', 'Categoria', 'Cassa', 'Importo'].map(h => (
                        <th key={h} style={{ padding: '9px 16px', textAlign: 'left', fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ultimi.map(m => (
                      <tr key={m.id} style={{ borderBottom: '1px solid #fafafa' }}>
                        <td style={{ padding: '10px 16px', color: 'var(--muted)' }}>
                          {m.data_contabile ? new Date(m.data_contabile).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) : '—'}
                        </td>
                        <td style={{ padding: '10px 16px', maxWidth: 300 }}>
                          <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500 }}>
                            {m.descrizione || '—'}
                          </div>
                        </td>
                        <td style={{ padding: '10px 16px', color: 'var(--muted)' }}>{m.macro_categoria || '—'}</td>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'var(--accent-light)', color: 'var(--accent)', fontWeight: 700 }}>
                            {m.cassa || '—'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px', fontWeight: 700, color: m.flusso === 'ENTRATE' ? 'var(--green)' : 'var(--red)', textAlign: 'right' }}>
                          {m.flusso === 'ENTRATE' ? '+' : ''}{fmtFull(m.importo)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}
