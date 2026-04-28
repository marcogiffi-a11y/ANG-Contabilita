'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import Topbar from '@/components/Topbar'

const fmt = (n: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n)
const fmtData = (d: string) => d ? new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
const MESI = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']

function parseData(val: any): string | null {
  if (!val) return null
  if (val instanceof Date) return (val as Date).toISOString().substring(0, 10)
  const s = String(val).trim()
  if (!s || s === 'null' || s === 'undefined') return null
  // ISO datetime
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.substring(0, 10)
  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // dd/mm/yyyy
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) { const p = s.split('/'); return p[2]+'-'+p[1].padStart(2,'0')+'-'+p[0].padStart(2,'0') }
  // dd-mm-yyyy
  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(s)) { const p = s.split('-'); return p[2]+'-'+p[1].padStart(2,'0')+'-'+p[0].padStart(2,'0') }
  // Excel serial number
  const n = parseFloat(s)
  if (!isNaN(n) && n > 40000 && n < 60000) {
    const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000)
    return d.toISOString().substring(0, 10)
  }
  // Prova a parsare qualsiasi altra cosa come Date
  try {
    const d = new Date(s)
    if (!isNaN(d.getTime()) && d.getFullYear() > 2000) return d.toISOString().substring(0, 10)
  } catch { return null }
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
    let q = (supabase as any).from('prima_nota').select('*').eq('anno', annoCorrente).order('data_contabile', { ascending: false }).limit(5000)
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
      const wb = XLSX.read(buffer, { type: 'array', cellDates: false })

      // Cerca foglio PN_ING o primo disponibile
      const sheetName = wb.SheetNames.find((s: string) => s === 'PN_ING') ||
                        wb.SheetNames.find((s: string) => s.includes('PN_') || s.includes('Prima') || s.includes('Movimenti')) ||
                        wb.SheetNames[0]
      const ws = wb.Sheets[sheetName]
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true })

      // Trova riga header
      let headerRowIdx = 0
      for (let i = 0; i < Math.min(10, rows.length); i++) {
        const nonEmpty = rows[i].filter((c: any) => c !== null && c !== undefined && String(c).trim() !== '').length
        if (nonEmpty >= 4) { headerRowIdx = i; break }
      }

      const headerRow = rows[headerRowIdx].map((c: any) => String(c || '').trim())
      const dataRows = rows.slice(headerRowIdx + 1).filter((r: any[]) => r && r.some((c: any) => c !== null && c !== undefined && String(c).trim() !== ''))

      // Rileva formato PN_ING
      const isPNFormat = headerRow.includes('Importo') && headerRow.includes('Flusso') && headerRow.includes('Data Contabile')

      let mp: any = {}
      let cassaDefault = 'FIDEURAM'

      if (isPNFormat) {
        setStep('📋 Formato PN_ING rilevato — import diretto...')
        const h = headerRow
        mp = {
          importo: h.indexOf('Importo'),
          data_contabile: h.indexOf('Data Contabile'),
          data_valuta: h.indexOf('Data Valuta'),
          descrizione: h.indexOf('Descrizione'),
          mittente_fornitore: h.indexOf('Mittente/Fornitore'),
          cliente_destinatario: h.indexOf('Cliente/Destinatario'),
          cassa: h.indexOf('CASSA'),
          flusso: h.indexOf('Flusso'),
          attivita: h.indexOf('Attività'),
          nome_progetto: h.indexOf('Nome Progetto'),
          tipo_attivita: h.indexOf('Tipo di Attività'),
          portafoglio: h.indexOf('Portafoglio'),
          voci_bilancio: h.indexOf('Voci di Bilancio'),
          macro_categoria: h.indexOf('Macro Categoria'),
          spesa_societaria: h.indexOf('Spesa Societaria'),
          youdox: h.indexOf('YouDox'),
          canale: h.indexOf('Canale'),
          n_protocollo: h.indexOf('N. Protocollo'),
          mese_col: h.indexOf('Mesi'),
          anno_col: h.indexOf('Anno'),
          trimestre_col: h.indexOf('Trimestre'),
          competenza_col: h.indexOf('Competenza'),
        }
      } else {
        setStep('🤖 AI analizza struttura file...')
        const mappingRes = await fetch('/api/import-excel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome_file: file.name, righe_header: headerRow, righe_dati: dataRows.slice(0, 3) })
        })
        const { mapping, error: mapErr } = await mappingRes.json()
        if (mapErr) throw new Error(mapErr)
        mp = mapping.mapping
        cassaDefault = (mapping.cassa_default || 'FIDEURAM').toUpperCase()
      }

      setStep('⚙️ Elaborazione dati...')
      const movimentiRaw: any[] = []

      const excelToDate = (v: any): string | null => {
        if (!v && v !== 0) return null
        if (typeof v === 'number' && v > 40000) {
          const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000)
          return d.toISOString().substring(0, 10)
        }
        return parseData(v)
      }

      const getVal = (row: any[], idx: any) => {
        if (idx === null || idx === undefined || idx < 0) return null
        const v = row[idx]
        return (v !== null && v !== undefined && String(v).trim() !== '') ? v : null
      }

      for (const row of dataRows) {
        let importo = 0
        const impRaw = getVal(row, mp.importo)
        if (impRaw !== null) {
          importo = typeof impRaw === 'number' ? impRaw : parseFloat(String(impRaw).replace(',', '.').replace(/[^0-9.-]/g, ''))
        }
        if (isNaN(importo)) importo = 0

        // Includi anche righe con importo 0 se hanno categoria o descrizione
        const hasCat = getVal(row, mp.macro_categoria) || getVal(row, mp.voci_bilancio) || getVal(row, mp.descrizione)
        if (importo === 0 && !hasCat) continue

        const dataContabile = excelToDate(getVal(row, mp.data_contabile))
        const dataValuta = excelToDate(getVal(row, mp.data_valuta))

        let mese: string | null = null
        let anno: number | null = null
        let trimestre: string | null = null

        if (isPNFormat && mp.mese_col >= 0 && getVal(row, mp.mese_col)) {
          mese = String(getVal(row, mp.mese_col))
          anno = getVal(row, mp.anno_col) ? Number(getVal(row, mp.anno_col)) : null
          trimestre = getVal(row, mp.trimestre_col) ? String(getVal(row, mp.trimestre_col)) : null
        } else if (dataContabile) {
          mese = getMese(dataContabile)
          anno = getAnno(dataContabile)
          trimestre = getTrimestre(mese)
        }

        const flussoRaw = getVal(row, mp.flusso) ? String(getVal(row, mp.flusso)).toUpperCase().trim() : null
        const flusso = (flussoRaw === 'ENTRATE' || flussoRaw === 'USCITE' || flussoRaw === 'GIROCONTO') ? flussoRaw : importo > 0 ? 'ENTRATE' : 'USCITE'
        const cassaVal = getVal(row, mp.cassa)
        const cassa = cassaVal ? String(cassaVal).toUpperCase() : cassaDefault

        movimentiRaw.push({
          trimestre, mese, anno,
          competenza: isPNFormat && mp.competenza_col >= 0 ? getVal(row, mp.competenza_col) : null,
          data_contabile: dataContabile,
          data_valuta: dataValuta,
          importo, flusso, cassa,
          n_protocollo: isPNFormat && mp.n_protocollo >= 0 ? (getVal(row, mp.n_protocollo) ? String(getVal(row, mp.n_protocollo)) : null) : null,
          descrizione: getVal(row, mp.descrizione) ? String(getVal(row, mp.descrizione)).substring(0, 500) : null,
          mittente_fornitore: getVal(row, mp.mittente_fornitore) ? String(getVal(row, mp.mittente_fornitore)) : null,
          cliente_destinatario: getVal(row, mp.cliente_destinatario) ? String(getVal(row, mp.cliente_destinatario)) : null,
          attivita: getVal(row, mp.attivita) ? String(getVal(row, mp.attivita)) : null,
          nome_progetto: getVal(row, mp.nome_progetto) ? String(getVal(row, mp.nome_progetto)) : null,
          tipo_attivita: getVal(row, mp.tipo_attivita) ? String(getVal(row, mp.tipo_attivita)) : null,
          portafoglio: getVal(row, mp.portafoglio) ? String(getVal(row, mp.portafoglio)) : null,
          voci_bilancio: getVal(row, mp.voci_bilancio) ? String(getVal(row, mp.voci_bilancio)) : null,
          macro_categoria: getVal(row, mp.macro_categoria) ? String(getVal(row, mp.macro_categoria)) : null,
          spesa_societaria: getVal(row, mp.spesa_societaria) ? String(getVal(row, mp.spesa_societaria)) : null,
          youdox: getVal(row, mp.youdox) === true || String(getVal(row, mp.youdox) || '').toLowerCase() === 'true' || String(getVal(row, mp.youdox) || '') === '1',
          canale: getVal(row, mp.canale) ? String(getVal(row, mp.canale)) : null,
          ai_categorizzato: !isPNFormat,
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
    return (m.descrizione || '').toLowerCase().includes(q) ||
      (m.mittente_fornitore || '').toLowerCase().includes(q) ||
      (m.macro_categoria || '').toLowerCase().includes(q) ||
      (m.nome_progetto || '').toLowerCase().includes(q) ||
      (m.cliente_destinatario || '').toLowerCase().includes(q) ||
      (m.voci_bilancio || '').toLowerCase().includes(q)
  })

  const totEnt = filtrati.filter((m: any) => m.flusso === 'ENTRATE').reduce((s: number, m: any) => s + (m.importo || 0), 0)
  const totUsc = filtrati.filter((m: any) => m.flusso === 'USCITE').reduce((s: number, m: any) => s + Math.abs(m.importo || 0), 0)

  const COLS = [
    { key: 'trimestre', label: 'Trimestre', w: 80 },
    { key: 'mese', label: 'Mese', w: 60 },
    { key: 'anno', label: 'Anno', w: 60 },
    { key: 'competenza', label: 'Competenza', w: 90 },
    { key: 'data_contabile', label: 'Data Contabile', w: 110 },
    { key: 'youdox', label: 'YouDox', w: 70 },
    { key: 'canale', label: 'Canale', w: 120 },
    { key: 'voci_bilancio', label: 'Voci di Bilancio', w: 200 },
    { key: 'macro_categoria', label: 'Macro Categoria', w: 160 },
    { key: 'n_protocollo', label: 'N. Protocollo', w: 120 },
    { key: 'data_valuta', label: 'Data Valuta', w: 100 },
    { key: 'importo', label: 'Importo', w: 110 },
    { key: 'descrizione', label: 'Descrizione', w: 240 },
    { key: 'mittente_fornitore', label: 'Mittente/Fornitore', w: 180 },
    { key: 'cliente_destinatario', label: 'Cliente/Destinatario', w: 180 },
    { key: 'cassa', label: 'Cassa', w: 100 },
    { key: 'spesa_societaria', label: 'Spesa Societaria', w: 180 },
    { key: 'flusso', label: 'Flusso', w: 90 },
    { key: 'attivita', label: 'Attività', w: 140 },
    { key: 'nome_progetto', label: 'Nome Progetto', w: 200 },
    { key: 'tipo_attivita', label: 'Tipo Attività', w: 160 },
    { key: 'portafoglio', label: 'Portafoglio', w: 130 },
  ]

  return (
    <>
      <Topbar title="Prima Nota" subtitle={`${movimenti.length} movimenti ${annoCorrente}`} />
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 999, background: '#0f172a', color: 'white', padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 500, boxShadow: '0 4px 20px rgba(0,0,0,.2)', maxWidth: 380 }}>{toast}</div>
      )}

      <div style={{ padding: '16px 24px 0' }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={cerca} onChange={e => setCerca(e.target.value)}
            placeholder="🔍  Cerca..."
            style={{ width: 200, padding: '7px 12px', border: '1px solid var(--border)', borderRadius: 7, background: 'white', fontSize: 12 }} />
          {[
            { val: filtroFlusso, set: setFiltroFlusso, opts: [['','Tutti i flussi'],['ENTRATE','Entrate'],['USCITE','Uscite'],['GIROCONTO','Giroconto']] },
            { val: filtroCassa, set: setFiltroCassa, opts: [['','Tutte le casse'],['FIDEURAM','Fideuram'],['UNICREDIT','Unicredit'],['REVOLUT ATHENA','Revolut']] },
          ].map((f, i) => (
            <select key={i} value={f.val} onChange={e => f.set(e.target.value)}
              style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7, background: 'white', fontSize: 12 }}>
              {f.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          ))}
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileImport} style={{ display: 'none' }} />
          <button className="btn-primary" onClick={() => fileRef.current?.click()} disabled={importing}>
            {importing ? `⏳ ${step}` : '📥 Importa Estratto Conto'}
          </button>
        </div>

        {/* KPI compatti a sinistra */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          {[
            { label: 'Entrate', val: totEnt, color: '#16a34a', bg: '#dcfce7', fmt: true },
            { label: 'Uscite', val: totUsc, color: '#dc2626', bg: '#fee2e2', fmt: true },
            { label: 'Saldo', val: totEnt - totUsc, color: totEnt - totUsc >= 0 ? '#16a34a' : '#dc2626', bg: totEnt - totUsc >= 0 ? '#dcfce7' : '#fee2e2', fmt: true },
            { label: 'Mov.', val: filtrati.length, color: '#1d3a6b', bg: '#e8eef7', fmt: false },
          ].map((t: any) => (
            <div key={t.label} style={{ padding: '7px 14px', borderRadius: 8, background: t.bg, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 9, color: t.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>{t.label}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: t.color, whiteSpace: 'nowrap' }}>{t.fmt ? fmt(t.val) : t.val}</div>
            </div>
          ))}
        </div>

        {/* Filtro mesi */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 14 }}>
          <button
            onClick={() => setFiltroMese('')}
            style={{
              padding: '4px 14px', fontSize: 11, fontWeight: 600, borderRadius: 20, cursor: 'pointer', border: 'none',
              background: filtroMese === '' ? 'var(--accent)' : '#f1f5f9',
              color: filtroMese === '' ? 'white' : 'var(--muted)',
            }}>
            Anno {annoCorrente}
          </button>
          {MESI.map(m => (
            <button key={m} onClick={() => setFiltroMese(filtroMese === m ? '' : m)}
              style={{
                padding: '4px 12px', fontSize: 11, fontWeight: 500, borderRadius: 20, cursor: 'pointer', border: 'none',
                background: filtroMese === m ? 'var(--accent)' : '#f1f5f9',
                color: filtroMese === m ? 'white' : 'var(--muted)',
                transition: 'all .12s'
              }}>
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Tabella con scroll orizzontale */}
      <div style={{ padding: '0 24px 24px' }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--muted)' }}>
              <div className="spinner" style={{ margin: '0 auto 12px' }} />Caricamento...
            </div>
          ) : filtrati.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)', fontSize: 13 }}>
              {movimenti.length === 0 ? 'Nessun movimento — clicca "Importa Estratto Conto" per iniziare' : 'Nessun movimento corrisponde ai filtri'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 340px)' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 11, tableLayout: 'fixed', width: COLS.reduce((s, c) => s + c.w, 0) + 'px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', position: 'sticky', top: 0, background: 'white', zIndex: 10 }}>
                    {COLS.map(c => (
                      <th key={c.key} style={{ width: c.w, minWidth: c.w, padding: '8px 10px', textAlign: 'left', fontSize: 9, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtrati.map((m: any) => (
                    <tr key={m.id} style={{ borderBottom: '1px solid #f5f5f5' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'white')}>
                      {/* Trimestre */}
                      <td style={{ padding: '8px 10px', color: 'var(--muted)', width: 80 }}>{m.trimestre || '—'}</td>
                      {/* Mese */}
                      <td style={{ padding: '8px 10px', width: 60 }}>{m.mese || '—'}</td>
                      {/* Anno */}
                      <td style={{ padding: '8px 10px', color: 'var(--muted)', width: 60 }}>{m.anno || '—'}</td>
                      {/* Competenza */}
                      <td style={{ padding: '8px 10px', color: 'var(--muted)', width: 90 }}>{m.competenza || '—'}</td>
                      {/* Data Contabile */}
                      <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', width: 110 }}>{fmtData(m.data_contabile)}</td>
                      {/* YouDox */}
                      <td style={{ padding: '8px 10px', textAlign: 'center', width: 70 }}>{m.youdox ? '✅' : '⬜'}</td>
                      {/* Canale */}
                      <td style={{ padding: '8px 10px', width: 120 }}>
                        {m.canale ? <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 20, background: '#f1f5f9', color: 'var(--muted)', fontWeight: 700 }}>{m.canale}</span> : '—'}
                      </td>
                      {/* Voci Bilancio */}
                      <td style={{ padding: '8px 10px', width: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.voci_bilancio || '—'}</td>
                      {/* Macro Categoria */}
                      <td style={{ padding: '8px 10px', width: 160, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.macro_categoria || '—'}</td>
                      {/* N. Protocollo */}
                      <td style={{ padding: '8px 10px', color: 'var(--muted)', fontSize: 10, width: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.n_protocollo || '—'}</td>
                      {/* Data Valuta */}
                      <td style={{ padding: '8px 10px', color: 'var(--muted)', whiteSpace: 'nowrap', width: 100 }}>{fmtData(m.data_valuta)}</td>
                      {/* Importo */}
                      <td style={{ padding: '8px 10px', fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap', width: 110, color: m.flusso === 'ENTRATE' ? 'var(--green)' : 'var(--red)' }}>
                        {m.flusso === 'ENTRATE' ? '+' : ''}{fmt(m.importo)}
                      </td>
                      {/* Descrizione */}
                      <td style={{ padding: '8px 10px', width: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{m.descrizione || '—'}</td>
                      {/* Mittente/Fornitore */}
                      <td style={{ padding: '8px 10px', width: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.mittente_fornitore || '—'}</td>
                      {/* Cliente/Destinatario */}
                      <td style={{ padding: '8px 10px', width: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.cliente_destinatario || '—'}</td>
                      {/* Cassa */}
                      <td style={{ padding: '8px 10px', width: 100 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: 'var(--accent-light)', color: 'var(--accent)' }}>{m.cassa || '—'}</span>
                      </td>
                      {/* Spesa Societaria */}
                      <td style={{ padding: '8px 10px', width: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--muted)' }}>{m.spesa_societaria || '—'}</td>
                      {/* Flusso */}
                      <td style={{ padding: '8px 10px', width: 90 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: m.flusso === 'ENTRATE' ? 'var(--green-light)' : m.flusso === 'USCITE' ? 'var(--red-light)' : '#f1f5f9', color: m.flusso === 'ENTRATE' ? 'var(--green)' : m.flusso === 'USCITE' ? 'var(--red)' : 'var(--muted)' }}>{m.flusso || '—'}</span>
                      </td>
                      {/* Attività */}
                      <td style={{ padding: '8px 10px', width: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.attivita || '—'}</td>
                      {/* Nome Progetto */}
                      <td style={{ padding: '8px 10px', width: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.nome_progetto ? <span style={{ fontSize: 10, background: 'var(--accent-light)', color: 'var(--accent)', padding: '2px 7px', borderRadius: 20 }}>{m.nome_progetto}</span> : '—'}
                      </td>
                      {/* Tipo Attività */}
                      <td style={{ padding: '8px 10px', width: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--muted)' }}>{m.tipo_attivita || '—'}</td>
                      {/* Portafoglio */}
                      <td style={{ padding: '8px 10px', width: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.portafoglio || '—'}</td>
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
