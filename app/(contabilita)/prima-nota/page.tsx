'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import Topbar from '@/components/Topbar'

const fmt = (n: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n)
const fmtData = (d: string) => d ? new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
const MESI = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']

function parseData(val: any): string | null {
  if (!val) return null
  const s = String(val).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10)
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) { const p = s.split('/'); return `${p[2]}-${p[1]}-${p[0]}` }
  if (/^\d{2}-\d{2}-\d{4}/.test(s)) { const p = s.split('-'); return `${p[2]}-${p[1]}-${p[0]}` }
  return null
}
function getMese(d: string) { return MESI[parseInt(d.split('-')[1]) - 1] }
function getAnno(d: string) { return parseInt(d.split('-')[0]) }
function getTrimestre(m: string) {
  if (['Gen','Feb','Mar'].includes(m)) return 'Q1'
  if (['Apr','Mag','Giu'].includes(m)) return 'Q2'
  if (['Lug','Ago','Set'].includes(m)) return 'Q3'
  return 'Q4'
}

export default function PrimaNotaPage() {
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [movimenti, setMovimenti] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [step, setStep] = useState('')
  const [cerca, setCerca] = useState('')
  const [filtroFlusso, setFiltroFlusso] = useState('')
  const [filtroCassa, setFiltroCassa] = useState('')
  const [filtroMese, setFiltroMese] = useState('')
  const [toast, setToast] = useState('')
  const annoCorrente = new Date().getFullYear()

  useEffect(() => { fetchMovimenti() }, [filtroFlusso, filtroCassa, filtroMese])

  async function fetchMovimenti() {
    setLoading(true)
    let q = (supabase as any).from('prima_nota').select('*').eq('anno', annoCorrente).order('data_contabile', { ascending: false }).limit(200)
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

    try {
      setStep('📊 Lettura Excel...')
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true })

      const sheetName = wb.SheetNames.find((s: string) => s.includes('PN_') || s.includes('Prima') || s.includes('Movimenti')) || wb.SheetNames[0]
      const ws = wb.Sheets[sheetName]
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' })

      // Trova header: prima riga con almeno 4 celle non vuote
      let headerRowIdx = 0
      for (let i = 0; i < Math.min(10, rows.length); i++) {
        const nonEmpty = rows[i].filter((c: any) => c !== null && c !== undefined && String(c).trim() !== '').length
        if (nonEmpty >= 4) { headerRowIdx = i; break }
      }

      const headerRow = rows[headerRowIdx].map((c: any) => String(c || '').trim())
      const dataRows = rows.slice(headerRowIdx + 1).filter((r: any[]) => r && r.some((c: any) => c !== null && c !== undefined && String(c).trim() !== ''))

      // Claude analizza struttura
      setStep('🤖 AI analizza struttura file...')
      const mappingRes = await fetch('/api/import-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome_file: file.name, righe_header: headerRow, righe_dati: dataRows.slice(0, 3) })
      })
      const { mapping, error: mapErr } = await mappingRes.json()
      if (mapErr) throw new Error(mapErr)

      const mp = mapping.mapping
      const cassaDefault = (mapping.cassa_default || 'FIDEURAM').toUpperCase()

      // Trasforma righe
      setStep('⚙️ Elaborazione dati...')
      const movimentiRaw: any[] = []

      for (const row of dataRows) {
        let importo = 0
        if (mp.importo !== null && mp.importo !== undefined) {
          const v = row[mp.importo]
          importo = typeof v === 'number' ? v : parseFloat(String(v || '0').replace(',', '.').replace(/[^0-9.-]/g, ''))
        } else if (mp.importo_dare !== null || mp.importo_avere !== null) {
          const dare = mp.importo_dare !== null ? parseFloat(String(row[mp.importo_dare] || '0').replace(',', '.').replace(/[^0-9.-]/g, '')) : 0
          const avere = mp.importo_avere !== null ? parseFloat(String(row[mp.importo_avere] || '0').replace(',', '.').replace(/[^0-9.-]/g, '')) : 0
          importo = avere - dare
        }
        if (isNaN(importo) || importo === 0) continue

        const dataContabile = parseData(mp.data_contabile !== null && mp.data_contabile !== undefined ? row[mp.data_contabile] : null)
        const dataValuta = parseData(mp.data_valuta !== null && mp.data_valuta !== undefined ? row[mp.data_valuta] : null)
        const mese = dataContabile ? getMese(dataContabile) : null
        const anno = dataContabile ? getAnno(dataContabile) : null
        const trimestre = mese ? getTrimestre(mese) : null

        const flussoRaw = mp.flusso !== null && mp.flusso !== undefined ? String(row[mp.flusso] || '').toUpperCase().trim() : null
        const flusso = flussoRaw === 'ENTRATE' || flussoRaw === 'USCITE' || flussoRaw === 'GIROCONTO' ? flussoRaw : importo > 0 ? 'ENTRATE' : 'USCITE'

        const get = (idx: any) => (idx !== null && idx !== undefined && row[idx] !== undefined && row[idx] !== null && String(row[idx]).trim() !== '') ? row[idx] : null

        movimentiRaw.push({
          trimestre, mese, anno,
          data_contabile: dataContabile,
          data_valuta: dataValuta,
          importo, flusso,
          descrizione: get(mp.descrizione) ? String(get(mp.descrizione)).substring(0, 500) : null,
          mittente_fornitore: get(mp.mittente_fornitore) ? String(get(mp.mittente_fornitore)) : null,
          cliente_destinatario: get(mp.cliente_destinatario) ? String(get(mp.cliente_destinatario)) : null,
          cassa: get(mp.cassa) ? String(get(mp.cassa)).toUpperCase() : cassaDefault,
          attivita: get(mp.attivita) ? String(get(mp.attivita)) : null,
          nome_progetto: get(mp.nome_progetto) ? String(get(mp.nome_progetto)) : null,
          portafoglio: get(mp.portafoglio) ? String(get(mp.portafoglio)) : null,
          voci_bilancio: get(mp.voci_bilancio) ? String(get(mp.voci_bilancio)) : null,
          macro_categoria: get(mp.macro_categoria) ? String(get(mp.macro_categoria)) : null,
          spesa_societaria: get(mp.spesa_societaria) ? String(get(mp.spesa_societaria)) : null,
          youdox: get(mp.youdox) ? (get(mp.youdox) === true || String(get(mp.youdox)).toLowerCase() === 'true') : false,
          canale: get(mp.canale) ? String(get(mp.canale)) : null,
          ai_categorizzato: false,
        })
      }

      // Categorizzazione AI solo per movimenti senza categoria
      const daCateg = movimentiRaw.filter(m => !m.macro_categoria && !m.voci_bilancio)
      if (daCateg.length > 0) {
        setStep(`🤖 AI categorizza ${daCateg.length} movimenti...`)
        const catRes = await fetch('/api/categorizza', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ movimenti: daCateg })
        })
        const { risultati } = await catRes.json()
        let catIdx = 0
        for (let i = 0; i < movimentiRaw.length; i++) {
          if (!movimentiRaw[i].macro_categoria && !movimentiRaw[i].voci_bilancio) {
            const ai = risultati?.find((r: any) => r.indice === catIdx)
            if (ai) {
              movimentiRaw[i].voci_bilancio = ai.voci_bilancio || null
              movimentiRaw[i].macro_categoria = ai.macro_categoria || null
              movimentiRaw[i].attivita = movimentiRaw[i].attivita || ai.attivita || null
              movimentiRaw[i].nome_progetto = movimentiRaw[i].nome_progetto || ai.nome_progetto || null
              movimentiRaw[i].youdox = movimentiRaw[i].youdox || ai.youdox || false
              movimentiRaw[i].ai_categorizzato = true
            }
            catIdx++
          }
        }
      }

      // Salva su Supabase
      setStep(`💾 Salvataggio ${movimentiRaw.length} movimenti...`)
      let inseriti = 0
      for (let i = 0; i < movimentiRaw.length; i += 50) {
        const batch = movimentiRaw.slice(i, i + 50)
        const { error } = await (supabase as any).from('prima_nota').insert(batch)
        if (!error) inseriti += batch.length
      }

      showToast(`✅ ${inseriti} movimenti importati con successo!`)
      await fetchMovimenti()

    } catch (err: any) {
      showToast(`❌ Errore: ${err.message}`)
    }
    setImporting(false)
    setStep('')
    if (fileRef.current) fileRef.current.value = ''
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 5000) }

  const filtrati = movimenti.filter((m: any) => {
    if (!cerca) return true
    const q = cerca.toLowerCase()
    return (m.descrizione || '').toLowerCase().includes(q) || (m.mittente_fornitore || '').toLowerCase().includes(q) || (m.macro_categoria || '').toLowerCase().includes(q) || (m.nome_progetto || '').toLowerCase().includes(q)
  })

  const totEnt = filtrati.filter((m: any) => m.flusso === 'ENTRATE').reduce((s: number, m: any) => s + m.importo, 0)
  const totUsc = filtrati.filter((m: any) => m.flusso === 'USCITE').reduce((s: number, m: any) => s + Math.abs(m.importo), 0)

  return (
    <>
      <Topbar title="Prima Nota" subtitle={`${movimenti.length} movimenti ${annoCorrente}`} />
      {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 999, background: '#0f172a', color: 'white', padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 500, boxShadow: '0 4px 20px rgba(0,0,0,.2)', maxWidth: 380 }}>{toast}</div>}
      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={cerca} onChange={e => setCerca(e.target.value)} placeholder="🔍  Cerca..." style={{ flex: 1, minWidth: 220, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 7, background: 'white' }} />
          {[
            { val: filtroFlusso, set: setFiltroFlusso, opts: [['','Tutti i flussi'],['ENTRATE','Entrate'],['USCITE','Uscite']] },
            { val: filtroCassa, set: setFiltroCassa, opts: [['','Tutte le casse'],['FIDEURAM','Fideuram'],['UNICREDIT','Unicredit']] },
            { val: filtroMese, set: setFiltroMese, opts: [['','Tutti i mesi'], ...MESI.map(m => [m, m])] },
          ].map((f, i) => (
            <select key={i} value={f.val} onChange={e => f.set(e.target.value)} style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 7, background: 'white', fontSize: 12 }}>
              {f.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          ))}
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileImport} style={{ display: 'none' }} />
          <button className="btn-primary" onClick={() => fileRef.current?.click()} disabled={importing}>
            {importing ? `⏳ ${step}` : '📥 Importa Estratto Conto'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          {[
            { label: 'Entrate', val: totEnt, color: 'var(--green)', bg: 'var(--green-light)', fmt: true },
            { label: 'Uscite', val: totUsc, color: 'var(--red)', bg: 'var(--red-light)', fmt: true },
            { label: 'Saldo netto', val: totEnt - totUsc, color: totEnt - totUsc >= 0 ? 'var(--green)' : 'var(--red)', bg: totEnt - totUsc >= 0 ? 'var(--green-light)' : 'var(--red-light)', fmt: true },
            { label: 'Movimenti', val: filtrati.length, color: 'var(--text)', bg: '#f1f5f9', fmt: false },
          ].map((t: any) => (
            <div key={t.label} style={{ padding: '10px 16px', borderRadius: 8, background: t.bg, flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: t.color, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>{t.label}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: t.color }}>{t.fmt ? fmt(t.val) : t.val}</div>
            </div>
          ))}
        </div>

        <div className="card" style={{ overflow: 'hidden' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--muted)' }}><div className="spinner" style={{ margin: '0 auto 12px' }} />Caricamento...</div>
          ) : filtrati.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)', fontSize: 13 }}>
              {movimenti.length === 0 ? 'Nessun movimento — clicca "Importa Estratto Conto" per iniziare' : 'Nessun movimento corrisponde ai filtri'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)' }}>
                    {['Data','Descrizione','Categoria','Progetto','Cassa','YouDox','Importo'].map(h => (
                      <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtrati.map((m: any) => (
                    <tr key={m.id} style={{ borderBottom: '1px solid #fafafa' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'white')}>
                      <td style={{ padding: '10px 14px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtData(m.data_contabile)}</td>
                      <td style={{ padding: '10px 14px', maxWidth: 280 }}>
                        <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.descrizione || '—'}</div>
                        {m.mittente_fornitore && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{m.mittente_fornitore}</div>}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        {m.macro_categoria ? <div><div style={{ fontWeight: 500 }}>{m.macro_categoria}</div><div style={{ fontSize: 10, color: 'var(--muted)' }}>{m.voci_bilancio}</div></div> : <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 14px', maxWidth: 160 }}>
                        {m.nome_progetto ? <span style={{ fontSize: 11, background: 'var(--accent-light)', color: 'var(--accent)', padding: '2px 8px', borderRadius: 20, display: 'block', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.nome_progetto}</span> : <span style={{ color: 'var(--muted)' }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'var(--accent-light)', color: 'var(--accent)' }}>{m.cassa}</span>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>{m.youdox ? '✅' : '⬜'}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap', color: m.flusso === 'ENTRATE' ? 'var(--green)' : 'var(--red)' }}>
                        {m.flusso === 'ENTRATE' ? '+' : ''}{fmt(m.importo)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {filtrati.length > 0 && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, textAlign: 'right' }}>{filtrati.length} di {movimenti.length} movimenti</div>}
      </div>
    </>
  )
}
