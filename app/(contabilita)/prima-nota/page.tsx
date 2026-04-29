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

// ── Helpers per import anti-timeout ────────────────────────────────────────
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function categorizzaConRetry(movimenti: any[]): Promise<any[]> {
  const call = () => fetch('/api/categorizza', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ movimenti }),
  }).then(r => r.json())

  try {
    const res = await call()
    if (res.risultati) return res.risultati
    throw new Error(res.error || 'Risposta vuota')
  } catch {
    // Riprova una volta dopo 1 secondo
    await sleep(1000)
    try {
      const res2 = await call()
      return res2.risultati ?? []
    } catch {
      return [] // Batch saltato — i movimenti restano senza categoria
    }
  }
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
  const [filtroAnno, setFiltroAnno] = useState(new Date().getFullYear().toString())
  const [toast, setToast] = useState('')
  const [selezionati, setSelezionati] = useState<Set<string>>(new Set())
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [senzaCatCount, setSenzaCatCount] = useState(0)
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null)

  // ── Valori validi per i dropdown — dalla Legenda ─────────────────────────
  const LEGENDA: Record<string, string[]> = {
    macro_categoria: ['Anticipi e Rimborsi','Benefit','Benefit MB','Benefit MG','Compensi Dipendenti','Compensi Esterni','Compenso MB','Compenso MG','Costi Amministrativi','Costi General Contractor','Costi di Gestione','Erario Statale','Formazione','Gestione Amministrativa','INPS','Introiti Aziendali','Investimenti Materiali','Investimento Aziendale','Investimento Finanziario','Investimento Reputazionale','Marketing','Provvigioni Agenti','Tributi'],
    voci_bilancio: ['Abbonamenti, libri, riviste e banche dati','Acquisto Beni inferiori a 516,46 euro','Aggiornamento e Manutenzione Software','Altri debiti v/soci','Altri oneri diversi di gestione','Apparecchiature Telefoniche','Assicurazioni Varie','Attrezzatura Varia e Minuta','Cancelleria','Canoni di Locazione','Canoni di Manutenzione su altri beni terzi','Canoni di Manutenzione su auto proprie','Carburanti e Lubrificanti','Carta di Credito Prepagata','Compensi amministratori','Consulente del Lavoro','Consulenze Commerciali','Consulenze Tecniche','Consulenze amministrative e fiscali',"Costi per licenze d'uso software",'Debiti per pagamento carte di credito','Diritto Annuale CCIAA','Energia Elettrica',"Erario c/credito d'imposta",'Erario c/ritenute su lavoro dipendente','Finanziamenti Infruttiferi Soci','Fondo Cassa','Impianti Specifici','Imposta di Bollo','Inarcassa','Indumenti di Lavoro','Introiti','Lavorazioni di Terzi','Licenze Software tempo det',"Macchine elettroniche D'Ufficio",'Manutenzione e Riparazioni Hardware','Manutenzioni e riparazioni altri beni terzi','Manutenzioni e riparazioni auto terzi','Marketing e Pubblicità','Materiale di Pulizia','Materiali di Manutenzione','Materie di consumo','Merci c/Acquisto','Migliorie e spese incrementative beni terzi','Mobili e Arredi','Noleggio Mezzi Aziendali','Oneri Sociali','Retribuzioni Dipendenti','Rimborso NC','Rimborso Professionisti','Ristorante','Sanzioni Amministrative','Somministrazioni in Ufficio','Spese Amministrative','Spese Condominiali su Immobili diterzi','Spese Telefonia','Spese di Pulizia','Spese di Rappresentanza','Spese legali e notarili','Spese non documentate','Spese per Addestramento e formazione personale','Strumenti di Lavoro','Tassa Vidimazione libri Sociali','Viaggi e Trasferte'],
    canale: ['CONTABILE','CASSETTO FISCALE','ADE'],
    spesa_societaria: ['Abbonamenti Ufficio','Accantonamento','Addebito Carta di credito','Adempimenti Società','Affitto Ufficio','Anticipi, Rimborsi e Storno Fattura','Arredo Ufficio','Assicurazione','Attività General Contractor','Attività Ingegneria','Auto aziendale','Beni Materiali Barone Marco','Beni Materiali Cavallaro Alessia','Beni Materiali Di Maita Claudia','Beni Materiali Giffi Marco','Cancelleria Ufficio','Carburante','Casello','Certificazioni','Commissioni bancarie','Compenso Barone Marco','Compenso Bartoloni Valentina','Compenso Cavallaro Alessia','Compenso Cavallaro Alessia IVA','Compenso Collaboratori - Occasionali','Compenso Di Maita Claudia','Compenso Di Maita Claudia IVA','Compenso Giffi Marco','Compenso Luca Greco','Compenso Sara Rao','Compravendita Crediti Fiscali','Condominio','Consulenza Grafica','Consulenza Tecnica','Contributi','Corsi di formazione','Costi Una Tantum - Investimento Ufficio','Costi gestione conto corrente','Costi una Tantum - Investimento Marketing','Costi una Tantum - Investimento organizzazione aziendale','FTV - Acquisto Materiali','FTV - Compenso Collaboratori - Occasionali','FTV - Installazione Impianti','FTV - Oneri Amministrativi','FTV - Provvigioni Commerciali','FTV - Spese Professionali','FTV - Spese di Trasporto','Fondo Cassa','Gestione Fiscale','Gestione Risorse Umane','Giroconto','Imposta di bollo','Imposte e Tasse','Investimenti Finanziari','Iscrizione Albo Fornitori','Lavori Straordinari Condominio','Lavori edili Ufficio','Liquidazione crediti','Manutenzione Auto','Manutenzione Ufficio','Materiale di Consumo Ufficio','Materiale didattico','Noleggio Macchinari','Omaggi a Clienti','Oneri Amministrativi','Oneri finanziari','Oneri per Cessione del Credito Fiscale','Patrimonio deperibile','Prelievo','Prestito infruttifero','Provvigioni Commerciali','Pulizia Ufficio','Ricarica carta prepagata','Ristorante per Lavoro',"Ritenuta d'acconto",'Sanzioni Ravvedimenti Interessi','Software','Somministrazione Ufficio','Spese Legali','Spese Notarili','Spese Professionali','Spese per Trasferta','Strumenti di Lavoro','Utenze luce e gas','Utenze telefoniche','Valori Bollati','Versamento','Versamento Assegni'],
    attivita: ['INGEGNERIA','GENERAL CONTRACTOR'],
    flusso: ['ENTRATE','USCITE','GIROCONTO'],
    portafoglio: ['Athena','Al Sistemi Srls','Alteren','ASSI TECK SRL','Audino','B.E. IMPIANTI di Bastianelli Emiliano','Barone','C.a.r.Go. Srl','DSC Srl','Edil Clima','Elle Gi','Fratticci','Guido Martini','Idrocalor SRL','Leroy Merlin','Mario Sulpizio','Mazzuferi Mirco','Pacelli','Porfiri Architects','Quartodipalo','Romana Finestre','Rosati','SmartCity','Veggi Arnaldo','TermoExpert','Trinchini Claudia','IDEA SRL'],
  }

  const ANNI = ['2024', '2025', '2026']

  const FORM_VUOTO: any = {
    trimestre: '', mese: '', anno: new Date().getFullYear(), competenza: '',
    data_contabile: '', youdox: false, canale: '', voci_bilancio: '',
    macro_categoria: '', n_protocollo: '', data_valuta: '', importo: '',
    descrizione: '', mittente_fornitore: '', cliente_destinatario: '',
    cassa: 'FIDEURAM', spesa_societaria: '', flusso: 'USCITE',
    attivita: '', nome_progetto: '', tipo_attivita: '', portafoglio: ''
  }
  const [form, setForm] = useState<any>(FORM_VUOTO)

  useEffect(() => { fetchMovimenti() }, [filtroFlusso, filtroCassa, filtroMese, filtroAnno])
  useEffect(() => {
    // Conta globalmente nel DB — indipendente dai filtri anno/mese attivi
    ;(supabase as any)
      .from('prima_nota')
      .select('id', { count: 'exact', head: true })
      .is('macro_categoria', null)
      .then(({ count }: any) => setSenzaCatCount(count || 0))
  }, [movimenti])

  async function fetchMovimenti() {
    setLoading(true)
    let q = (supabase as any).from('prima_nota').select('*').order('data_contabile', { ascending: false }).limit(5000)
    if (filtroAnno) q = q.eq('anno', parseInt(filtroAnno))
    if (filtroFlusso) q = q.eq('flusso', filtroFlusso)
    if (filtroCassa) q = q.eq('cassa', filtroCassa)
    if (filtroMese) q = q.eq('mese', filtroMese)
    const { data } = await q
    setMovimenti(data || [])
    setSelezionati(new Set())
    setLoading(false)
  }

  async function ricategorizza() {
    if (importing) return
    setImporting(true)
    try {
      // Prende dal DB tutte le righe senza macro_categoria
      const { data: senzaCat } = await (supabase as any)
        .from('prima_nota')
        .select('id, descrizione, mittente_fornitore, importo, data_contabile')
        .is('macro_categoria', null)
        .limit(500)

      if (!senzaCat || senzaCat.length === 0) {
        showToast('✅ Tutti i movimenti sono già categorizzati!')
        setImporting(false)
        return
      }

      setStep(`🤖 AI categorizza ${senzaCat.length} movimenti...`)
      const BATCH = 10
      let categorizzati = 0

      for (let b = 0; b < senzaCat.length; b += BATCH) {
        const chunk = senzaCat.slice(b, b + BATCH)
        const risultati = await categorizzaConRetry(chunk)

        for (let j = 0; j < chunk.length; j++) {
          const ai = risultati.find((r: any) => r.indice === j)
          if (ai && chunk[j].id) {
            await (supabase as any).from('prima_nota').update({
              voci_bilancio:    ai.voci_bilancio    || null,
              macro_categoria:  ai.macro_categoria   || null,
              attivita:         ai.attivita          || null,
              nome_progetto:    ai.nome_progetto     || null,
              tipo_attivita:    ai.tipo_attivita     || null,
              portafoglio:      ai.portafoglio       || null,
              canale:           ai.canale            || null,
              spesa_societaria: ai.spesa_societaria  || null,
              flusso:           ai.flusso            || null,
              youdox:           ai.youdox            || false,
              ai_categorizzato: true,
            }).eq('id', chunk[j].id)
            categorizzati++
          }
        }

        if (b + BATCH < senzaCat.length) await sleep(400)
      }

      showToast(`✅ ${categorizzati} movimenti categorizzati!`)
      await fetchMovimenti()
    } catch (err: any) {
      showToast(`❌ Errore: ${err.message}`)
    }
    setImporting(false)
    setStep('')
  }

  async function salvaModifica(id: string, field: string, value: string) {
    setEditingCell(null)
    const { error } = await (supabase as any)
      .from('prima_nota')
      .update({ [field]: value || null })
      .eq('id', id)
    if (!error) {
      setMovimenti(prev => prev.map(m => m.id === id ? { ...m, [field]: value || null } : m))
    } else {
      showToast('❌ Errore salvataggio')
    }
  }

  // ── Cella editabile con dropdown ────────────────────────────────────────
  function CellaCategoria({ m, field, width }: { m: any; field: string; width: number }) {
    const val = m[field]
    const isEditing = editingCell?.id === m.id && editingCell?.field === field
    const opts = LEGENDA[field] || []

    if (isEditing) {
      return (
        <td style={{ padding: '2px 4px', width, minWidth: width }}>
          <select
            autoFocus
            defaultValue={val || ''}
            onChange={e => salvaModifica(m.id, field, e.target.value)}
            onBlur={() => setEditingCell(null)}
            style={{ width: '100%', fontSize: 11, padding: '4px 6px', border: '2px solid var(--accent)', borderRadius: 5, background: 'white', outline: 'none' }}>
            <option value="">— nessuno —</option>
            {opts.map((o: string) => <option key={o} value={o}>{o}</option>)}
          </select>
        </td>
      )
    }

    return (
      <td
        onClick={() => setEditingCell({ id: m.id, field })}
        title="Clicca per modificare"
        style={{ padding: '8px 10px', width, minWidth: width, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {val
          ? <span style={{ borderBottom: '1px dashed #cbd5e1' }}>{val}</span>
          : <span style={{ color: '#f59e0b', fontSize: 10, fontWeight: 600 }}>✏️ —</span>}
      </td>
    )
  }

  async function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      setStep('📊 Lettura Excel...')
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array', raw: true })
      const sheetName = wb.SheetNames.find((s: string) => s === 'PN_ING') ||
                        wb.SheetNames.find((s: string) => s.includes('PN_') || s.includes('Prima') || s.includes('Movimenti')) ||
                        wb.SheetNames[0]
      const ws = wb.Sheets[sheetName]
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true })

      let headerRowIdx = 0
      for (let i = 0; i < Math.min(30, rows.length); i++) {
        const nonEmpty = rows[i].filter((c: any) => c !== null && c !== undefined && String(c).trim() !== '').length
        if (nonEmpty >= 4) { headerRowIdx = i; break }
      }

      const headerRow = rows[headerRowIdx].map((c: any) => String(c || '').trim())
      const dataRows = rows.slice(headerRowIdx + 1).filter((r: any[]) => r && r.some((c: any) => c !== null && c !== undefined && String(c).trim() !== ''))

      const isPNFormat = headerRow.includes('Importo') && headerRow.includes('Flusso') && headerRow.includes('Data Contabile')

      let mp: any = {}
      let cassaDefault = 'FIDEURAM'

      if (isPNFormat) {
        setStep('📋 Formato PN_ING — import diretto...')
        const h = headerRow
        mp = {
          importo: h.indexOf('Importo'), data_contabile: h.indexOf('Data Contabile'),
          data_valuta: h.indexOf('Data Valuta'), descrizione: h.indexOf('Descrizione'),
          mittente_fornitore: h.indexOf('Mittente/Fornitore'), cliente_destinatario: h.indexOf('Cliente/Destinatario'),
          cassa: h.indexOf('CASSA'), flusso: h.indexOf('Flusso'), attivita: h.indexOf('Attività'),
          nome_progetto: h.indexOf('Nome Progetto'), tipo_attivita: h.indexOf('Tipo di Attività'),
          portafoglio: h.indexOf('Portafoglio'), voci_bilancio: h.indexOf('Voci di Bilancio'),
          macro_categoria: h.indexOf('Macro Categoria'), spesa_societaria: h.indexOf('Spesa Societaria'),
          youdox: h.indexOf('YouDox'), canale: h.indexOf('Canale'), n_protocollo: h.indexOf('N. Protocollo'),
          mese_col: h.indexOf('Mesi'), anno_col: h.indexOf('Anno'),
          trimestre_col: h.indexOf('Trimestre'), competenza_col: h.indexOf('Competenza'),
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
        if (v === null || v === undefined) return null
        const s = String(v).trim()
        // Ignora celle che contengono ancora una formula non calcolata
        if (s === '' || s.startsWith('=')) return null
        return v
      }

      for (const row of dataRows) {
        let importo = 0
        const impRaw = getVal(row, mp.importo)
        if (impRaw !== null) {
          importo = typeof impRaw === 'number' ? impRaw : parseFloat(String(impRaw).replace(',', '.').replace(/[^0-9.-]/g, ''))
        } else if (mp.importo_dare !== undefined || mp.importo_avere !== undefined) {
          // Fideuram: Addebiti già negativi, Accrediti positivi → si sommano
          const dare = (mp.importo_dare !== null && mp.importo_dare >= 0 && row[mp.importo_dare] !== null && row[mp.importo_dare] !== undefined)
            ? parseFloat(String(row[mp.importo_dare]).replace(',', '.').replace(/[^0-9.-]/g, '')) : 0
          const avere = (mp.importo_avere !== null && mp.importo_avere >= 0 && row[mp.importo_avere] !== null && row[mp.importo_avere] !== undefined)
            ? parseFloat(String(row[mp.importo_avere]).replace(',', '.').replace(/[^0-9.-]/g, '')) : 0
          importo = (isNaN(avere) ? 0 : avere) + (isNaN(dare) ? 0 : dare)
        }
        if (isNaN(importo)) importo = 0

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
          // Competenza: legge dall'Excel, fallback all'anno della data contabile
          competenza: (() => {
            const v = isPNFormat && mp.competenza_col >= 0 ? getVal(row, mp.competenza_col) : null
            if (v) return Number(v)
            return anno || null
          })(),
          data_contabile: dataContabile, data_valuta: dataValuta,
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

      // ── STEP 1: salva subito tutti i movimenti, ottieni gli id ──────────
      setStep(`💾 Salvataggio ${movimentiRaw.length} movimenti...`)
      const savedIds: string[] = []
      for (let i = 0; i < movimentiRaw.length; i += 50) {
        const chunk = movimentiRaw.slice(i, i + 50)
        const { data: ins } = await (supabase as any).from('prima_nota').insert(chunk).select('id')
        if (ins) savedIds.push(...ins.map((r: any) => r.id))
      }

      // ── STEP 2: categorizza in batch da 10, aggiorna il DB per id ────────
      const daCateg = movimentiRaw
        .map((m, i) => ({ ...m, _id: savedIds[i] }))
        .filter(m => m._id && (!m.macro_categoria || !m.voci_bilancio))

      if (daCateg.length > 0) {
        setStep(`🤖 AI categorizza ${daCateg.length} movimenti...`)
        const BATCH = 10
        for (let b = 0; b < daCateg.length; b += BATCH) {
          const chunk = daCateg.slice(b, b + BATCH)
          const risultati = await categorizzaConRetry(chunk)

          for (let j = 0; j < chunk.length; j++) {
            const ai = risultati.find((r: any) => r.indice === j)
            if (ai && chunk[j]._id) {
              const aggiornamenti: any = { ai_categorizzato: true }
              // Sovrascrive solo i campi ancora vuoti — preserva quelli letti dall'Excel
              if (!chunk[j].voci_bilancio    && ai.voci_bilancio)    aggiornamenti.voci_bilancio    = ai.voci_bilancio
              if (!chunk[j].macro_categoria  && ai.macro_categoria)   aggiornamenti.macro_categoria  = ai.macro_categoria
              if (!chunk[j].attivita         && ai.attivita)          aggiornamenti.attivita         = ai.attivita
              if (!chunk[j].nome_progetto    && ai.nome_progetto)     aggiornamenti.nome_progetto    = ai.nome_progetto
              if (!chunk[j].tipo_attivita    && ai.tipo_attivita)     aggiornamenti.tipo_attivita    = ai.tipo_attivita
              if (!chunk[j].portafoglio      && ai.portafoglio)       aggiornamenti.portafoglio      = ai.portafoglio
              if (!chunk[j].canale           && ai.canale)            aggiornamenti.canale           = ai.canale
              if (!chunk[j].spesa_societaria && ai.spesa_societaria)  aggiornamenti.spesa_societaria = ai.spesa_societaria
              if (!chunk[j].flusso           && ai.flusso)            aggiornamenti.flusso           = ai.flusso
              if (!chunk[j].youdox)                                   aggiornamenti.youdox           = ai.youdox || false
              await (supabase as any).from('prima_nota').update(aggiornamenti).eq('id', chunk[j]._id)
            }
          }

          // pausa tra batch per non sovraccaricare
          if (b + BATCH < daCateg.length) await sleep(400)
        }
      }

      showToast(`✅ ${savedIds.length} movimenti importati!`)
      await fetchMovimenti()
    } catch (err: any) {
      showToast(`❌ Errore: ${err.message}`)
    }
    setImporting(false)
    setStep('')
    if (fileRef.current) fileRef.current.value = ''
  }

  async function eliminaSelezionati() {
    if (selezionati.size === 0) return
    if (!confirm(`Eliminare ${selezionati.size} movimenti selezionati?`)) return
    const ids = Array.from(selezionati)
    const { error } = await (supabase as any).from('prima_nota').delete().in('id', ids)
    if (!error) {
      showToast(`✅ ${ids.length} movimenti eliminati`)
      await fetchMovimenti()
    } else {
      showToast('❌ Errore eliminazione')
    }
  }

  async function salvaManuale() {
    setSaving(true)
    const importoNum = parseFloat(String(form.importo).replace(',', '.'))
    if (isNaN(importoNum)) { showToast('❌ Importo non valido'); setSaving(false); return }

    const mese = form.data_contabile ? getMese(form.data_contabile) : form.mese || null
    const anno = form.data_contabile ? getAnno(form.data_contabile) : form.anno ? parseInt(form.anno) : null
    const trimestre = mese ? getTrimestre(mese) : form.trimestre || null

    const record: any = {
      ...form,
      importo: importoNum,
      mese, anno, trimestre,
      competenza: form.competenza ? parseInt(form.competenza) : null,
      youdox: form.youdox === true || form.youdox === 'true',
    }
    Object.keys(record).forEach(k => { if (record[k] === '') record[k] = null })

    const { error } = await (supabase as any).from('prima_nota').insert(record)
    if (!error) {
      showToast('✅ Movimento aggiunto!')
      setShowForm(false)
      setForm(FORM_VUOTO)
      await fetchMovimenti()
    } else {
      showToast('❌ Errore salvataggio')
    }
    setSaving(false)
  }

  function toggleSel(id: string) {
    setSelezionati(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }
  function toggleTutti() {
    if (selezionati.size === filtrati.length) {
      setSelezionati(new Set())
    } else {
      setSelezionati(new Set(filtrati.map((m: any) => m.id)))
    }
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 5000) }
  function setF(k: string, v: any) { setForm((prev: any) => ({ ...prev, [k]: v })) }

  const filtrati = movimenti.filter((m: any) => {
    if (!cerca) return true
    const q = cerca.toLowerCase()
    return (m.descrizione || '').toLowerCase().includes(q) ||
      (m.mittente_fornitore || '').toLowerCase().includes(q) ||
      (m.macro_categoria || '').toLowerCase().includes(q) ||
      (m.nome_progetto || '').toLowerCase().includes(q) ||
      (m.cliente_destinatario || '').toLowerCase().includes(q)
  })

  const totEnt = filtrati.filter((m: any) => m.flusso === 'ENTRATE').reduce((s: number, m: any) => s + (m.importo || 0), 0)
  const totUsc = filtrati.filter((m: any) => m.flusso === 'USCITE').reduce((s: number, m: any) => s + Math.abs(m.importo || 0), 0)

  const COLS = [
    { key: 'sel', label: '', w: 40 },
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

  const inpStyle: any = { width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, background: 'white' }
  const lblStyle: any = { fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 4 }

  const CAMPI_FORM = [
    { key: 'data_contabile', label: 'Data Contabile', type: 'date' },
    { key: 'data_valuta', label: 'Data Valuta', type: 'date' },
    { key: 'importo', label: 'Importo (€)', type: 'number' },
    { key: 'flusso', label: 'Flusso', type: 'select', opts: ['ENTRATE','USCITE','GIROCONTO'] },
    { key: 'cassa', label: 'Cassa', type: 'select', opts: ['FIDEURAM','UNICREDIT','REVOLUT ATHENA','CASSETTO FISCALE','CONTANTI'] },
    { key: 'canale', label: 'Canale', type: 'select', opts: ['CONTABILE','CASSETTO FISCALE','ADE'] },
    { key: 'descrizione', label: 'Descrizione', type: 'text' },
    { key: 'mittente_fornitore', label: 'Mittente/Fornitore', type: 'text' },
    { key: 'cliente_destinatario', label: 'Cliente/Destinatario', type: 'text' },
    { key: 'voci_bilancio', label: 'Voci di Bilancio', type: 'text' },
    { key: 'macro_categoria', label: 'Macro Categoria', type: 'text' },
    { key: 'spesa_societaria', label: 'Spesa Societaria', type: 'text' },
    { key: 'attivita', label: 'Attività', type: 'select', opts: ['INGEGNERIA','GENERAL CONTRACTOR'] },
    { key: 'nome_progetto', label: 'Nome Progetto', type: 'text' },
    { key: 'tipo_attivita', label: 'Tipo Attività', type: 'text' },
    { key: 'portafoglio', label: 'Portafoglio', type: 'text' },
    { key: 'n_protocollo', label: 'N. Protocollo', type: 'text' },
    { key: 'competenza', label: 'Competenza (anno)', type: 'number' },
    { key: 'anno', label: 'Anno', type: 'number' },
    { key: 'mese', label: 'Mese', type: 'select', opts: MESI },
    { key: 'trimestre', label: 'Trimestre', type: 'select', opts: ['Q1','Q2','Q3','Q4'] },
    { key: 'youdox', label: 'YouDox', type: 'checkbox' },
  ]

  return (
    <>
      <Topbar title="Prima Nota" subtitle={`${movimenti.length} movimenti`} />
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 999, background: '#0f172a', color: 'white', padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 500, boxShadow: '0 4px 20px rgba(0,0,0,.2)', maxWidth: 380 }}>{toast}</div>
      )}

      {/* MODALE AGGIUNTA MANUALE */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setShowForm(false) }}>
          <div style={{ background: 'white', borderRadius: 12, width: '90%', maxWidth: 700, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>➕ Nuovo Movimento</div>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
            </div>
            <div style={{ overflowY: 'auto', padding: 20, flex: 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {CAMPI_FORM.map((campo: any) => (
                  <div key={campo.key} style={{ gridColumn: campo.key === 'descrizione' ? '1/-1' : 'auto' }}>
                    <label style={lblStyle}>{campo.label}</label>
                    {campo.type === 'checkbox' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="checkbox" checked={!!form[campo.key]} onChange={e => setF(campo.key, e.target.checked)}
                          style={{ width: 16, height: 16 }} />
                        <span style={{ fontSize: 12 }}>{form[campo.key] ? 'Sì' : 'No'}</span>
                      </div>
                    ) : campo.type === 'select' ? (
                      <select value={form[campo.key] || ''} onChange={e => setF(campo.key, e.target.value)} style={inpStyle}>
                        <option value="">—</option>
                        {campo.opts.map((o: string) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input type={campo.type} value={form[campo.key] || ''} onChange={e => setF(campo.key, e.target.value)} style={inpStyle} />
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setShowForm(false)}>Annulla</button>
              <button className="btn-primary" onClick={salvaManuale} disabled={saving}>{saving ? 'Salvataggio...' : '💾 Salva Movimento'}</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: '14px 24px 0' }}>

        {/* Riga 1: Ricerca + filtri + importa */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={cerca} onChange={e => setCerca(e.target.value)} placeholder="🔍  Cerca..."
            style={{ width: 180, padding: '7px 12px', border: '1px solid var(--border)', borderRadius: 7, background: 'white', fontSize: 12 }} />
          <select value={filtroAnno} onChange={e => setFiltroAnno(e.target.value)}
            style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7, background: 'white', fontSize: 12, fontWeight: 600 }}>
            {ANNI.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
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

          {/* Ricategorizza — compare solo se ci sono movimenti senza categoria */}
          {senzaCatCount > 0 && !importing && (
            <button onClick={ricategorizza}
              style={{ padding: '7px 14px', fontSize: 12, fontWeight: 600, background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              🔁 Ricategorizza
              <span style={{ background: '#f59e0b', color: 'white', borderRadius: 20, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>
                {senzaCatCount}
              </span>
            </button>
          )}
        </div>

        {/* Riga 2: KPI grandi */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          {[
            { label: 'Entrate', val: totEnt, color: '#16a34a', bg: '#dcfce7', fmt: true },
            { label: 'Uscite', val: totUsc, color: '#dc2626', bg: '#fee2e2', fmt: true },
            { label: 'Saldo netto', val: totEnt - totUsc, color: totEnt - totUsc >= 0 ? '#16a34a' : '#dc2626', bg: totEnt - totUsc >= 0 ? '#dcfce7' : '#fee2e2', fmt: true },
            { label: 'Movimenti', val: filtrati.length, color: '#1d3a6b', bg: '#e8eef7', fmt: false },
          ].map((t: any) => (
            <div key={t.label} style={{ padding: '10px 18px', borderRadius: 9, background: t.bg }}>
              <div style={{ fontSize: 10, color: t.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>{t.label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: t.color, whiteSpace: 'nowrap' }}>{t.fmt ? fmt(t.val) : t.val}</div>
            </div>
          ))}
        </div>

        {/* Riga 3: bottoni azione + filtri mese */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn-secondary" onClick={() => { setForm(FORM_VUOTO); setShowForm(true) }}
            style={{ fontSize: 12, padding: '6px 14px' }}>
            ➕ Aggiungi
          </button>
          {selezionati.size > 0 && (
            <button onClick={eliminaSelezionati}
              style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 7, cursor: 'pointer' }}>
              🗑 Elimina {selezionati.size} selezionati
            </button>
          )}

          <div style={{ width: 1, height: 22, background: 'var(--border)', margin: '0 4px' }} />

          <button onClick={() => setFiltroMese('')}
            style={{ padding: '5px 14px', fontSize: 11, fontWeight: 600, borderRadius: 20, cursor: 'pointer', border: 'none', background: filtroMese === '' ? 'var(--accent)' : '#f1f5f9', color: filtroMese === '' ? 'white' : 'var(--muted)' }}>
            Tutti
          </button>
          {MESI.map(m => (
            <button key={m} onClick={() => setFiltroMese(filtroMese === m ? '' : m)}
              style={{ padding: '5px 10px', fontSize: 11, fontWeight: 500, borderRadius: 20, cursor: 'pointer', border: 'none', background: filtroMese === m ? 'var(--accent)' : '#f1f5f9', color: filtroMese === m ? 'white' : 'var(--muted)' }}>
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Tabella */}
      <div style={{ padding: '0 24px 24px' }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--muted)' }}>
              <div className="spinner" style={{ margin: '0 auto 12px' }} />Caricamento...
            </div>
          ) : filtrati.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)', fontSize: 13 }}>
              {movimenti.length === 0 ? 'Nessun movimento — importa o aggiungi manualmente' : 'Nessun movimento corrisponde ai filtri'}
            </div>
          ) : (
            <div id="tbl-scroll" style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 280px)' }}
              onScroll={e => { const mirror = document.getElementById('scroll-mirror'); if(mirror) mirror.scrollLeft = (e.target as HTMLDivElement).scrollLeft }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 11, tableLayout: 'fixed', width: COLS.reduce((s, c) => s + c.w, 0) + 'px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', position: 'sticky', top: 0, background: 'white', zIndex: 10 }}>
                    <th style={{ width: 40, padding: '8px 10px' }}>
                      <input type="checkbox" checked={selezionati.size === filtrati.length && filtrati.length > 0}
                        onChange={toggleTutti} style={{ cursor: 'pointer' }} />
                    </th>
                    {COLS.slice(1).map(c => (
                      <th key={c.key} style={{ width: c.w, minWidth: c.w, padding: '8px 10px', textAlign: 'left', fontSize: 9, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap' }}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtrati.map((m: any) => (
                    <tr key={m.id}
                      style={{ borderBottom: '1px solid #f5f5f5', background: selezionati.has(m.id) ? '#eff6ff' : 'white' }}
                      onMouseEnter={e => { if (!selezionati.has(m.id)) e.currentTarget.style.background = '#f8fafc' }}
                      onMouseLeave={e => { e.currentTarget.style.background = selezionati.has(m.id) ? '#eff6ff' : 'white' }}>
                      <td style={{ padding: '8px 10px', width: 40 }}>
                        <input type="checkbox" checked={selezionati.has(m.id)} onChange={() => toggleSel(m.id)} style={{ cursor: 'pointer' }} />
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--muted)', width: 80 }}>{m.trimestre || '—'}</td>
                      <td style={{ padding: '8px 10px', width: 60 }}>{m.mese || '—'}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--muted)', width: 60 }}>{m.anno || '—'}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--muted)', width: 90 }}>{m.competenza || '—'}</td>
                      <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', width: 110 }}>{fmtData(m.data_contabile)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'center', width: 70 }}>{m.youdox ? '✅' : '⬜'}</td>
                      <CellaCategoria m={m} field="canale" width={120} />
                      <CellaCategoria m={m} field="voci_bilancio" width={200} />
                      <CellaCategoria m={m} field="macro_categoria" width={160} />
                      <td style={{ padding: '8px 10px', color: 'var(--muted)', fontSize: 10, width: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.n_protocollo || '—'}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--muted)', whiteSpace: 'nowrap', width: 100 }}>{fmtData(m.data_valuta)}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap', width: 110, color: m.flusso === 'ENTRATE' ? 'var(--green)' : 'var(--red)' }}>
                        {m.flusso === 'ENTRATE' ? '+' : ''}{fmt(m.importo)}
                      </td>
                      <td style={{ padding: '8px 10px', width: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{m.descrizione || '—'}</td>
                      <td style={{ padding: '8px 10px', width: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.mittente_fornitore || '—'}</td>
                      <td style={{ padding: '8px 10px', width: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.cliente_destinatario || '—'}</td>
                      <td style={{ padding: '8px 10px', width: 100 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: 'var(--accent-light)', color: 'var(--accent)' }}>{m.cassa || '—'}</span>
                      </td>
                      <CellaCategoria m={m} field="spesa_societaria" width={180} />
                      <CellaCategoria m={m} field="flusso" width={90} />
                      <CellaCategoria m={m} field="attivita" width={140} />
                      <td style={{ padding: '8px 10px', width: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.nome_progetto ? <span style={{ fontSize: 10, background: 'var(--accent-light)', color: 'var(--accent)', padding: '2px 7px', borderRadius: 20 }}>{m.nome_progetto}</span> : '—'}
                      </td>
                      <td style={{ padding: '8px 10px', width: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--muted)' }}>{m.tipo_attivita || '—'}</td>
                      <CellaCategoria m={m} field="portafoglio" width={130} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Scrollbar orizzontale — fissa in fondo, sempre visibile */}
        <div id="scroll-mirror"
          style={{ overflowX: 'scroll', overflowY: 'hidden', height: 18, marginTop: 2 }}
          onScroll={e => { const tbl = document.getElementById('tbl-scroll'); if(tbl) tbl.scrollLeft = (e.target as HTMLDivElement).scrollLeft }}>
          <style>{`
            #scroll-mirror::-webkit-scrollbar { height: 12px; }
            #scroll-mirror::-webkit-scrollbar-track { background: #e2e8f0; border-radius: 6px; }
            #scroll-mirror::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 6px; }
            #scroll-mirror::-webkit-scrollbar-thumb:hover { background: #64748b; }
            #tbl-scroll::-webkit-scrollbar { height: 0px; width: 0px; }
          `}</style>
          <div style={{ width: COLS.reduce((s, c) => s + c.w, 0) + 'px', height: 1 }} />
        </div>

        {filtrati.length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, display: 'flex', justifyContent: 'space-between' }}>
            <span>{selezionati.size > 0 && `${selezionati.size} selezionati · `}{filtrati.length} di {movimenti.length} movimenti</span>
          </div>
        )}
      </div>
    </>
  )
}
