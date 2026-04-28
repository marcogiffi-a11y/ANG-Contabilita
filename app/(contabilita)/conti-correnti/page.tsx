'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Topbar from '@/components/Topbar'

const fmt = (n: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n)

const ANNI = [2024, 2025, 2026, 2027]
const COLORI = ['#1d3a6b','#16a34a','#dc2626','#d97706','#7c3aed','#0891b2','#db2777','#65a30d']

export default function ContiCorrentiPage() {
  const supabase = createClient()
  const [conti, setConti] = useState<any[]>([])
  const [saldi, setSaldi] = useState<any[]>([])
  const [movimenti, setMovimenti] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [annoSel, setAnnoSel] = useState(new Date().getFullYear())
  const [toast, setToast] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ nome: '', banca: '', iban: '', colore: '#1d3a6b' })

  useEffect(() => { loadAll() }, [annoSel])

  async function loadAll() {
    setLoading(true)
    const [{ data: c }, { data: s }, { data: m }] = await Promise.all([
      (supabase as any).from('conti_correnti').select('*').eq('attivo', true).order('created_at'),
      (supabase as any).from('saldi_iniziali').select('*'),
      (supabase as any).from('prima_nota').select('importo, flusso, cassa, anno').eq('anno', annoSel),
    ])
    setConti(c || [])
    setSaldi(s || [])
    setMovimenti(m || [])
    setLoading(false)
  }

  function getSaldoIniziale(contoNome: string, anno: number) {
    const conto = conti.find(c => c.nome.toUpperCase() === contoNome.toUpperCase() || c.nome === contoNome)
    if (!conto) return 0
    const s = saldi.find(s => s.conto_id === conto.id && s.anno === anno)
    return s?.saldo || 0
  }

  function getMovimentiConto(contoNome: string) {
    return movimenti.filter(m => (m.cassa || '').toUpperCase() === contoNome.toUpperCase())
  }

  function getSaldoReale(contoNome: string) {
    const iniziale = getSaldoIniziale(contoNome, annoSel)
    const movConto = getMovimentiConto(contoNome)
    const entrate = movConto.filter(m => m.flusso === 'ENTRATE').reduce((s: number, m: any) => s + (m.importo || 0), 0)
    const uscite = movConto.filter(m => m.flusso === 'USCITE').reduce((s: number, m: any) => s + Math.abs(m.importo || 0), 0)
    return iniziale + entrate - uscite
  }

  async function aggiornaSaldo(contoId: string, anno: number, valore: number) {
    await (supabase as any).from('saldi_iniziali').upsert(
      { conto_id: contoId, anno, saldo: valore, updated_at: new Date().toISOString() },
      { onConflict: 'conto_id,anno' }
    )
    await loadAll()
    showToast('✅ Saldo aggiornato')
  }

  async function aggiungiConto() {
    if (!form.nome.trim()) return
    setSaving(true)
    const { error } = await (supabase as any).from('conti_correnti').insert({
      nome: form.nome.trim().toUpperCase(),
      banca: form.banca.trim() || null,
      iban: form.iban.trim() || null,
      colore: form.colore,
    })
    if (!error) {
      showToast('✅ Conto aggiunto!')
      setShowForm(false)
      setForm({ nome: '', banca: '', iban: '', colore: '#1d3a6b' })
      await loadAll()
    } else {
      showToast('❌ Errore: ' + error.message)
    }
    setSaving(false)
  }

  async function disattivaConto(id: string) {
    if (!confirm('Disattivare questo conto? Rimarrà nello storico ma non apparirà più.')) return
    await (supabase as any).from('conti_correnti').update({ attivo: false }).eq('id', id)
    await loadAll()
    showToast('✅ Conto disattivato')
  }

  async function eliminaConto(id: string, nome: string) {
    if (!confirm(`ATTENZIONE: eliminare definitivamente il conto "${nome}"?\nQuesta operazione non può essere annullata.`)) return
    await (supabase as any).from('saldi_iniziali').delete().eq('conto_id', id)
    await (supabase as any).from('conti_correnti').delete().eq('id', id)
    await loadAll()
    showToast('✅ Conto eliminato')
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 4000) }

  const totaleReale = conti.reduce((s, c) => s + getSaldoReale(c.nome), 0)
  const totaleIniziale = conti.reduce((s, c) => s + getSaldoIniziale(c.nome, annoSel), 0)

  const inpStyle: any = { width: '100%', padding: '8px 10px', border: '1px solid #e5e5e2', borderRadius: 7, fontSize: 13 }
  const lblStyle: any = { fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '.05em', display: 'block', marginBottom: 4 }

  return (
    <>
      <Topbar title="Conti Correnti" subtitle={`${conti.length} conti attivi`} />

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 999, background: '#0f172a', color: 'white', padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 500, maxWidth: 360 }}>{toast}</div>
      )}

      {/* Modale nuovo conto */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setShowForm(false) }}>
          <div style={{ background: 'white', borderRadius: 12, width: 440, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e5e2', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Nuovo Conto Corrente</div>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={lblStyle}>Nome conto *</label>
                <input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))}
                  placeholder="es. FIDEURAM, UNICREDIT..." style={inpStyle} />
              </div>
              <div>
                <label style={lblStyle}>Banca</label>
                <input value={form.banca} onChange={e => setForm(p => ({ ...p, banca: e.target.value }))}
                  placeholder="es. Fideuram S.p.A." style={inpStyle} />
              </div>
              <div>
                <label style={lblStyle}>IBAN</label>
                <input value={form.iban} onChange={e => setForm(p => ({ ...p, iban: e.target.value }))}
                  placeholder="IT60 X054 2811 1010 0000 0123 456" style={inpStyle} />
              </div>
              <div>
                <label style={lblStyle}>Colore identificativo</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {COLORI.map(c => (
                    <button key={c} onClick={() => setForm(p => ({ ...p, colore: c }))}
                      style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: form.colore === c ? '3px solid #0f172a' : '2px solid transparent', cursor: 'pointer' }} />
                  ))}
                </div>
              </div>
            </div>
            <div style={{ padding: '14px 20px', borderTop: '1px solid #e5e5e2', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowForm(false)} style={{ padding: '8px 16px', border: '1px solid #e5e5e2', borderRadius: 7, background: 'white', cursor: 'pointer', fontSize: 13 }}>Annulla</button>
              <button onClick={aggiungiConto} disabled={saving || !form.nome.trim()}
                style={{ padding: '8px 18px', background: '#1d3a6b', color: 'white', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: saving ? .6 : 1 }}>
                {saving ? 'Salvataggio...' : '+ Aggiungi Conto'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: 24 }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center' }}>
          <select value={annoSel} onChange={e => setAnnoSel(parseInt(e.target.value))}
            style={{ padding: '8px 12px', border: '1px solid #e5e5e2', borderRadius: 7, fontSize: 13, fontWeight: 600, background: 'white' }}>
            {ANNI.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <div style={{ flex: 1 }} />
          <button onClick={() => setShowForm(true)}
            style={{ padding: '8px 18px', background: '#1d3a6b', color: 'white', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            + Nuovo Conto
          </button>
        </div>

        {/* KPI totale */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          {[
            { label: `Liquidità totale reale ${annoSel}`, val: totaleReale, color: totaleReale >= 0 ? '#16a34a' : '#dc2626', bg: totaleReale >= 0 ? '#dcfce7' : '#fee2e2' },
            { label: `Saldo iniziale totale 01/01/${annoSel}`, val: totaleIniziale, color: '#1d3a6b', bg: '#e8eef7' },
            { label: 'Variazione anno', val: totaleReale - totaleIniziale, color: totaleReale - totaleIniziale >= 0 ? '#16a34a' : '#dc2626', bg: totaleReale - totaleIniziale >= 0 ? '#dcfce7' : '#fee2e2' },
          ].map(k => (
            <div key={k.label} style={{ flex: 1, padding: '14px 18px', borderRadius: 10, background: k.bg }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: k.color, marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: k.color }}>{fmt(k.val)}</div>
            </div>
          ))}
        </div>

        {/* Lista conti */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: '#64748b' }}>Caricamento...</div>
        ) : conti.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#64748b', fontSize: 13 }}>
            Nessun conto — clicca "+ Nuovo Conto" per iniziare
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {conti.map(conto => {
              const saldoIniz = getSaldoIniziale(conto.nome, annoSel)
              const saldoReale = getSaldoReale(conto.nome)
              const movConto = getMovimentiConto(conto.nome)
              const entrate = movConto.filter(m => m.flusso === 'ENTRATE').reduce((s: number, m: any) => s + (m.importo || 0), 0)
              const uscite = movConto.filter(m => m.flusso === 'USCITE').reduce((s: number, m: any) => s + Math.abs(m.importo || 0), 0)
              const variazione = saldoReale - saldoIniz

              return (
                <div key={conto.id} style={{ background: 'white', border: '1px solid #e5e5e2', borderRadius: 12, overflow: 'hidden' }}>
                  {/* Header conto */}
                  <div style={{ display: 'flex', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #f5f5f3', gap: 14 }}>
                    <div style={{ width: 12, height: 12, borderRadius: '50%', background: conto.colore, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{conto.nome}</div>
                      {conto.banca && <div style={{ fontSize: 12, color: '#64748b' }}>{conto.banca}</div>}
                      {conto.iban && <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>{conto.iban}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => disattivaConto(conto.id)}
                        style={{ background: 'none', border: '1px solid #e5e5e2', borderRadius: 6, color: '#64748b', cursor: 'pointer', fontSize: 11, padding: '4px 10px' }}>
                        Disattiva
                      </button>
                      <button onClick={() => eliminaConto(conto.id, conto.nome)}
                        style={{ background: 'none', border: '1px solid #fee2e2', borderRadius: 6, color: '#dc2626', cursor: 'pointer', fontSize: 11, padding: '4px 10px' }}>
                        Elimina
                      </button>
                    </div>
                  </div>

                  {/* Dati conto */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 0 }}>
                    {/* Saldo iniziale editabile */}
                    <div style={{ padding: '16px 20px', borderRight: '1px solid #f5f5f3' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
                        Saldo 01/01/{annoSel}
                      </div>
                      <SaldoInput
                        value={saldoIniz}
                        onSave={(v) => aggiornaSaldo(conto.id, annoSel, v)}
                      />
                    </div>

                    {/* Entrate */}
                    <div style={{ padding: '16px 20px', borderRight: '1px solid #f5f5f3' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Entrate {annoSel}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#16a34a' }}>+{fmt(entrate)}</div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{movConto.filter(m => m.flusso === 'ENTRATE').length} movimenti</div>
                    </div>

                    {/* Uscite */}
                    <div style={{ padding: '16px 20px', borderRight: '1px solid #f5f5f3' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Uscite {annoSel}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#dc2626' }}>-{fmt(uscite)}</div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{movConto.filter(m => m.flusso === 'USCITE').length} movimenti</div>
                    </div>

                    {/* Variazione */}
                    <div style={{ padding: '16px 20px', borderRight: '1px solid #f5f5f3' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Variazione</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: variazione >= 0 ? '#16a34a' : '#dc2626' }}>
                        {variazione >= 0 ? '+' : ''}{fmt(variazione)}
                      </div>
                    </div>

                    {/* Saldo reale */}
                    <div style={{ padding: '16px 20px', background: saldoReale >= 0 ? '#f0fdf4' : '#fef2f2' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: saldoReale >= 0 ? '#16a34a' : '#dc2626', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
                        Saldo reale oggi
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: saldoReale >= 0 ? '#16a34a' : '#dc2626' }}>
                        {fmt(saldoReale)}
                      </div>
                      <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>saldo iniziale + movimenti</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}

function SaldoInput({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value.toString())

  useEffect(() => { setVal(value.toString()) }, [value])

  if (!editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => setEditing(true)}>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
          {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value)}
        </span>
        <span style={{ fontSize: 10, color: '#94a3b8' }}>✏️</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <input type="number" value={val} onChange={e => setVal(e.target.value)} autoFocus
        style={{ width: 120, padding: '5px 8px', border: '2px solid #1d3a6b', borderRadius: 6, fontSize: 13, fontWeight: 600 }} />
      <button onClick={() => { onSave(parseFloat(val) || 0); setEditing(false) }}
        style={{ background: '#1d3a6b', color: 'white', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>✓</button>
      <button onClick={() => { setVal(value.toString()); setEditing(false) }}
        style={{ background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', fontSize: 12 }}>✕</button>
    </div>
  )
}
