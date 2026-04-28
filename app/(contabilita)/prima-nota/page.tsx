'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import Topbar from '@/components/Topbar'

const fmt = (n: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n)
const fmtData = (d: string) => d ? new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

const MESI = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']

function getMese(dateStr: string): string {
  return MESI[parseInt(dateStr.split('-')[1]) - 1]
}
function getAnno(dateStr: string): number {
  return parseInt(dateStr.split('-')[0])
}
function getTrimestre(mese: string): string {
  if (['Gen','Feb','Mar'].includes(mese)) return 'Q1'
  if (['Apr','Mag','Giu'].includes(mese)) return 'Q2'
  if (['Lug','Ago','Set'].includes(mese)) return 'Q3'
  return 'Q4'
}

export default function PrimaNotaPage() {
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [movimenti, setMovimenti] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [categorizzando, setCategorizzando] = useState(false)
  const [cerca, setCerca] = useState('')
  const [filtroFlusso, setFiltroFlusso] = useState('')
  const [filtroCassa, setFiltroCassa] = useState('')
  const [filtroMese, setFiltroMese] = useState('')
  const [toast, setToast] = useState('')

  const annoCorrente = new Date().getFullYear()

  useEffect(() => { fetchMovimenti() }, [filtroFlusso, filtroCassa, filtroMese])

  async function fetchMovimenti() {
    setLoading(true)
    let q = supabase
      .from('prima_nota')
      .select('*')
      .eq('anno', annoCorrente)
      .order('data_contabile', { ascending: false })
      .limit(200)

    if (filtroFlusso) q = q.eq('flusso', filtroFlusso)
    if (filtroCassa) q = q.eq('cassa', filtroCassa)
    if (filtroMese) q = q.eq('mese', filtroMese)

    const { data } = await q
    setMovimenti(data || [])
    setLoading(false)
  }

  async function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    showToast('📊 Lettura file Excel...')

    try {
      // Import dinamico per evitare problemi SSR
      const XLSX = await import('xlsx')

      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { header: 1 })

      // Cerca riga header
      let headerRow = -1
      let headers: string[] = []
      for (let i = 0; i < Math.min(10, rows.length); i++) {
        const row = rows[i].map((c: any) => String(c || '').toLowerCase().trim())
        if (row.some((c: string) => c.includes('data') || c.includes('importo') || c.includes('descrizione'))) {
          headerRow = i
          headers = row
          break
        }
      }

      if (headerRow === -1) {
        showToast('❌ Formato file non riconosciuto')
        setImporting(false)
        return
      }

      const idxData = headers.findIndex(h => h.includes('data') && !h.includes('valuta'))
      const idxImporto = headers.findIndex(h => h.includes('importo') || h.includes('dare') || h.includes('avere'))
      const idxDesc = headers.findIndex(h => h.includes('descrizione') || h.includes('causale'))
      const idxValuta = headers.findIndex(h => h.includes('valuta'))

      const movimentiImport: any[] = []

      for (let i = headerRow + 1; i < rows.length; i++) {
        const row = rows[i]
        if (!row || row.length === 0) continue

        const importoRaw = row[idxImporto >= 0 ? idxImporto : 0]
        const importo = typeof importoRaw === 'number'
          ? importoRaw
          : parseFloat(String(importoRaw || '0').replace(',', '.').replace(/[^0-9.-]/g, ''))

        if (isNaN(importo) || importo === 0) continue

        const dataRaw = row[idxData >= 0 ? idxData : 0]
        let dataContabile: string | null = null

        if (dataRaw) {
          if (typeof dataRaw === 'number') {
            const date = XLSX.SSF.parse_date_code(dataRaw)
            dataContabile = `${date.y}-${String(date.m).padStart(2,'0')}-${String(date.d).padStart(2,'0')}`
          } else {
            const s = String(dataRaw).trim()
            const parts = s.split(/[\/\-]/)
            if (parts.length === 3) {
              const y = parts[2].length === 2 ? '20' + parts[2] : parts[2]
              dataContabile = `${y}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`
            }
          }
        }

        const mese = dataContabile ? getMese(dataContabile) : null
        const anno = dataContabile ? getAnno(dataContabile) : null
        const trimestre = mese ? getTrimestre(mese) : null

        movimentiImport.push({
          trimestre,
          mese,
          anno,
          data_contabile: dataContabile,
          data_valuta: idxValuta >= 0 && row[idxValuta] ? dataContabile : null,
          importo,
          descrizione: row[idxDesc >= 0 ? idxDesc : 0] ? String(row[idxDesc >= 0 ? idxDesc : 0]).substring(0, 500) : null,
          flusso: importo > 0 ? 'ENTRATE' : 'USCITE',
          cassa: 'FIDEURAM',
          youdox: false,
          ai_categorizzato: false,
        })
      }

      showToast(`🤖 ${movimentiImport.length} movimenti letti — categorizzazione AI...`)
      setCategorizzando(true)

      // Categorizzazione AI
      const res = await fetch('/api/categorizza', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ movimenti: movimentiImport })
      })
      const { risultati } = await res.json()

      const movimentiFinali = movimentiImport.map((m, idx) => {
        const ai = risultati?.find((r: any) => r.indice === idx)
        return {
          ...m,
          voci_bilancio: ai?.voci_bilancio || null,
          macro_categoria: ai?.macro_categoria || null,
          spesa_societaria: ai?.spesa_societaria || null,
          attivita: ai?.attivita || null,
          nome_progetto: ai?.nome_progetto || null,
          tipo_attivita: ai?.tipo_attivita || null,
          youdox: ai?.youdox || false,
          ai_categorizzato: true,
        }
      })

      setCategorizzando(false)
      showToast(`💾 Salvataggio...`)

      let inseriti = 0
      for (let i = 0; i < movimentiFinali.length; i += 50) {
        const batch = movimentiFinali.slice(i, i + 50)
        const { error } = await supabase.from('prima_nota').insert(batch as any[])
        if (!error) inseriti += batch.length
      }

      showToast(`✅ ${inseriti} movimenti importati!`)
      await fetchMovimenti()

    } catch (err: any) {
      showToast(`❌ Errore: ${err.message}`)
    }

    setImporting(false)
    setCategorizzando(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 4000)
  }

  const filtrati = movimenti.filter(m => {
    if (!cerca) return true
    const q = cerca.toLowerCase()
    return (m.descrizione || '').toLowerCase().includes(q) ||
      (m.mittente_fornitore || '').toLowerCase().includes(q) ||
      (m.macro_categoria || '').toLowerCase().includes(q) ||
      (m.nome_progetto || '').toLowerCase().includes(q)
  })

  const totaleEntrate = filtrati.filter(m => m.flusso === 'ENTRATE').reduce((s, m) => s + m.importo, 0)
  const totaleUscite = filtrati.filter(m => m.flusso === 'USCITE').reduce((s, m) => s + Math.abs(m.importo), 0)

  return (
    <>
      <Topbar title="Prima Nota" subtitle={`${movimenti.length} movimenti ${annoCorrente}`} />

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 999,
          background: '#0f172a', color: 'white', padding: '12px 20px',
          borderRadius: 10, fontSize: 13, fontWeight: 500,
          boxShadow: '0 4px 20px rgba(0,0,0,.2)', maxWidth: 360
        }}>{toast}</div>
      )}

      <div style={{ padding: 24 }}>

        {/* Toolbar */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={cerca}
            onChange={e => setCerca(e.target.value)}
            placeholder="🔍  Cerca descrizione, categoria, progetto..."
            style={{ flex: 1, minWidth: 220, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 7, background: 'white' }}
          />

          {[
            { val: filtroFlusso, set: setFiltroFlusso, opts: [['','Tutti i flussi'],['ENTRATE','Entrate'],['USCITE','Uscite']] },
            { val: filtroCassa, set: setFiltroCassa, opts: [['','Tutte le casse'],['FIDEURAM','Fideuram'],['UNICREDIT','Unicredit']] },
            { val: filtroMese, set: setFiltroMese, opts: [['','Tutti i mesi'], ...MESI.map(m => [m, m])] },
          ].map((f, i) => (
            <select key={i} value={f.val} onChange={e => f.set(e.target.value)}
              style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 7, background: 'white', fontSize: 12 }}>
              {f.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          ))}

          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileImport} style={{ display: 'none' }} />
          <button
            className="btn-primary"
            onClick={() => fileRef.current?.click()}
            disabled={importing || categorizzando}
          >
            {categorizzando ? '🤖 AI in corso...' : importing ? '⏳ Import...' : '📥 Importa Estratto Conto'}
          </button>
        </div>

        {/* Totali */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          {[
            { label: 'Entrate', val: totaleEntrate, color: 'var(--green)', bg: 'var(--green-light)' },
            { label: 'Uscite', val: totaleUscite, color: 'var(--red)', bg: 'var(--red-light)' },
            { label: 'Saldo netto', val: totaleEntrate - totaleUscite, color: totaleEntrate - totaleUscite >= 0 ? 'var(--green)' : 'var(--red)', bg: totaleEntrate - totaleUscite >= 0 ? 'var(--green-light)' : 'var(--red-light)' },
            { label: 'Movimenti', val: filtrati.length, color: 'var(--text)', bg: '#f1f5f9', noFmt: true },
          ].map((t: any) => (
            <div key={t.label} style={{ padding: '10px 16px', borderRadius: 8, background: t.bg, flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: t.color, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>{t.label}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: t.color }}>{t.noFmt ? t.val : fmt(t.val)}</div>
            </div>
          ))}
        </div>

        {/* Tabella */}
        <div className="card" style={{ overflow: 'hidden' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--muted)' }}>
              <div className="spinner" style={{ margin: '0 auto 12px' }} />
              Caricamento...
            </div>
          ) : filtrati.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)', fontSize: 13 }}>
              {movimenti.length === 0
                ? 'Nessun movimento — clicca "Importa Estratto Conto" per iniziare'
                : 'Nessun movimento corrisponde ai filtri'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)' }}>
                    {['Data', 'Descrizione', 'Categoria', 'Progetto', 'Cassa', 'YouDox', 'Importo'].map(h => (
                      <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtrati.map(m => (
                    <tr key={m.id} style={{ borderBottom: '1px solid #fafafa' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'white')}>

                      <td style={{ padding: '10px 14px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtData(m.data_contabile)}</td>

                      <td style={{ padding: '10px 14px', maxWidth: 280 }}>
                        <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {m.descrizione || '—'}
                        </div>
                        {m.mittente_fornitore && (
                          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{m.mittente_fornitore}</div>
                        )}
                      </td>

                      <td style={{ padding: '10px 14px' }}>
                        {m.macro_categoria ? (
                          <div>
                            <div style={{ fontWeight: 500 }}>{m.macro_categoria}</div>
                            <div style={{ fontSize: 10, color: 'var(--muted)' }}>{m.voci_bilancio}</div>
                          </div>
                        ) : <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>—</span>}
                      </td>

                      <td style={{ padding: '10px 14px', maxWidth: 160 }}>
                        {m.nome_progetto ? (
                          <span style={{ fontSize: 11, background: 'var(--accent-light)', color: 'var(--accent)', padding: '2px 8px', borderRadius: 20, display: 'block', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {m.nome_progetto}
                          </span>
                        ) : <span style={{ color: 'var(--muted)' }}>—</span>}
                      </td>

                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'var(--accent-light)', color: 'var(--accent)' }}>
                          {m.cassa}
                        </span>
                      </td>

                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <span style={{ fontSize: 14 }}>{m.youdox ? '✅' : '⬜'}</span>
                      </td>

                      <td style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap',
                        color: m.flusso === 'ENTRATE' ? 'var(--green)' : 'var(--red)' }}>
                        {m.flusso === 'ENTRATE' ? '+' : ''}{fmt(m.importo)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {filtrati.length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, textAlign: 'right' }}>
            {filtrati.length} di {movimenti.length} movimenti
          </div>
        )}
      </div>
    </>
  )
}
