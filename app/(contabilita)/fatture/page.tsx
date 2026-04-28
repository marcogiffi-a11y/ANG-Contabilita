'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Topbar from '@/components/Topbar'

const fmt = (n: number | null) => n != null ? new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n) : '—'
const fmtData = (d: string | null) => d ? new Date(d).toLocaleDateString('it-IT') : '—'

export default function FatturePage() {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [fatture, setFatture] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [filtroTipo, setFiltroTipo] = useState('')
  const [cerca, setCerca] = useState('')
  const [toast, setToast] = useState('')
  const [selezionata, setSelezionata] = useState<any>(null)

  useEffect(() => { fetchFatture() }, [filtroTipo])

  async function fetchFatture() {
    setLoading(true)
    let q = supabase.from('fatture').select('*').order('data_fattura', { ascending: false }).limit(100)
    if (filtroTipo) q = q.eq('tipo', filtroTipo)
    const { data } = await q
    setFatture(data || [])
    setLoading(false)
  }

  async function processFile(file: File) {
    if (file.type !== 'application/pdf') {
      showToast('❌ Solo file PDF supportati')
      return
    }

    setUploading(true)
    showToast('🤖 Analisi AI fattura in corso...')

    try {
      // 1. Analisi AI
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/analizza-fattura', { method: 'POST', body: formData })
      const { dati, error: aiError } = await res.json()

      if (aiError) throw new Error(aiError)

      showToast('📤 Upload PDF su storage...')

      // 2. Upload PDF su Supabase Storage
      const fileName = `${Date.now()}_${file.name.replace(/\s/g, '_')}`
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('fatture-ang')
        .upload(fileName, file, { contentType: 'application/pdf' })

      let pdfUrl = null
      if (!uploadError && uploadData) {
        const { data: urlData } = supabase.storage.from('fatture-ang').getPublicUrl(fileName)
        pdfUrl = urlData.publicUrl
      }

      // 3. Salva fattura su DB
      const { error: dbError } = await supabase.from('fatture').insert({
        ...dati,
        pdf_url: pdfUrl,
        ai_estratto: true,
      })

      if (dbError) throw dbError

      showToast('✅ Fattura caricata e analizzata!')
      await fetchFatture()

    } catch (err: any) {
      showToast(`❌ Errore: ${err.message}`)
    }

    setUploading(false)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    files.forEach(processFile)
  }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 4000)
  }

  const filtrate = fatture.filter(f => {
    if (!cerca) return true
    const q = cerca.toLowerCase()
    return (f.fornitore_cliente || '').toLowerCase().includes(q) ||
      (f.numero || '').toLowerCase().includes(q) ||
      (f.descrizione || '').toLowerCase().includes(q)
  })

  const totAttive = fatture.filter(f => f.tipo === 'ATTIVA').reduce((s, f) => s + (f.totale || 0), 0)
  const totPassive = fatture.filter(f => f.tipo === 'PASSIVA').reduce((s, f) => s + (f.totale || 0), 0)

  return (
    <>
      <Topbar title="Fatture" subtitle={`${fatture.length} fatture caricate`} />

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 999,
          background: '#0f172a', color: 'white', padding: '12px 20px',
          borderRadius: 10, fontSize: 13, fontWeight: 500,
          boxShadow: '0 4px 20px rgba(0,0,0,.2)', maxWidth: 380
        }}>{toast}</div>
      )}

      <div style={{ padding: 24 }}>

        {/* Drag & Drop Zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 12, padding: 28, textAlign: 'center',
            background: dragOver ? 'var(--accent-light)' : 'white',
            cursor: uploading ? 'wait' : 'pointer',
            marginBottom: 20, transition: 'all .2s'
          }}
        >
          <input ref={fileInputRef} type="file" accept=".pdf" multiple
            onChange={e => Array.from(e.target.files || []).forEach(processFile)}
            style={{ display: 'none' }} />
          {uploading ? (
            <div style={{ color: 'var(--accent)' }}>
              <div className="spinner" style={{ margin: '0 auto 8px' }} />
              <div style={{ fontWeight: 600, fontSize: 13 }}>Elaborazione in corso...</div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
              <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                Trascina qui i PDF delle fatture
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                oppure clicca per selezionare — l'AI estrarrà tutti i dati automaticamente
              </div>
            </>
          )}
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          {[
            { label: 'Fatture Attive', val: fmt(totAttive), color: 'var(--green)', bg: 'var(--green-light)', count: fatture.filter(f => f.tipo === 'ATTIVA').length },
            { label: 'Fatture Passive', val: fmt(totPassive), color: 'var(--red)', bg: 'var(--red-light)', count: fatture.filter(f => f.tipo === 'PASSIVA').length },
            { label: 'Saldo', val: fmt(totAttive - totPassive), color: totAttive - totPassive >= 0 ? 'var(--green)' : 'var(--red)', bg: totAttive - totPassive >= 0 ? 'var(--green-light)' : 'var(--red-light)', count: null },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, padding: '12px 16px', borderRadius: 8, background: s.bg }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: s.color, textTransform: 'uppercase', marginBottom: 4 }}>{s.label}{s.count != null ? ` (${s.count})` : ''}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.val}</div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <input value={cerca} onChange={e => setCerca(e.target.value)}
            placeholder="🔍  Cerca fornitore/cliente, numero..."
            style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 7, background: 'white', fontSize: 12 }} />
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
            style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 7, background: 'white', fontSize: 12 }}>
            <option value="">Tutte</option>
            <option value="ATTIVA">Attive</option>
            <option value="PASSIVA">Passive</option>
          </select>
        </div>

        {/* Tabella fatture */}
        <div className="card" style={{ overflow: 'hidden' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--muted)' }}>
              <div className="spinner" style={{ margin: '0 auto 12px' }} />
            </div>
          ) : filtrate.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)', fontSize: 13 }}>
              Nessuna fattura — carica il primo PDF qui sopra
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  {['Tipo', 'N. Fattura', 'Data', 'Fornitore/Cliente', 'Descrizione', 'Imponibile', 'IVA', 'Totale', 'Collegata', 'PDF'].map(h => (
                    <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrate.map(f => (
                  <tr key={f.id}
                    onClick={() => setSelezionata(f)}
                    style={{ borderBottom: '1px solid #fafafa', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'white')}>

                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                        background: f.tipo === 'ATTIVA' ? 'var(--green-light)' : 'var(--red-light)',
                        color: f.tipo === 'ATTIVA' ? 'var(--green)' : 'var(--red)'
                      }}>{f.tipo}</span>
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 600 }}>{f.numero || '—'}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtData(f.data_fattura)}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 500, maxWidth: 200 }}>
                      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.fornitore_cliente || '—'}</div>
                      {f.partita_iva && <div style={{ fontSize: 10, color: 'var(--muted)' }}>P.IVA: {f.partita_iva}</div>}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--muted)', maxWidth: 180 }}>
                      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.descrizione || '—'}</div>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>{fmt(f.imponibile)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--muted)' }}>{fmt(f.iva)}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'right',
                      color: f.tipo === 'ATTIVA' ? 'var(--green)' : 'var(--red)' }}>{fmt(f.totale)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      {f.movimento_id ? '🔗' : <span style={{ color: 'var(--muted)' }}>—</span>}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {f.pdf_url ? (
                        <a href={f.pdf_url} target="_blank" rel="noreferrer"
                          onClick={e => e.stopPropagation()}
                          style={{ color: 'var(--accent)', fontSize: 11, fontWeight: 600, textDecoration: 'none' }}>
                          📄 Apri
                        </a>
                      ) : <span style={{ color: 'var(--muted)' }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}
