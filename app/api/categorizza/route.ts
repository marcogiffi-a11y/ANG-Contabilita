import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const LEGENDA_CONTEXT = `
Sei il sistema di categorizzazione contabile di Athena Next Gen S.r.l., studio di ingegneria fotovoltaica.

VOCI DI BILANCIO COMUNI:
- Affitto Ufficio/I.B.O. Roma → Canoni di Locazione | Costi di Gestione
- ARVAL (auto) → Noleggio Mezzi Aziendali | Benefit MG
- Carburante/Q8/ENI/IP/Tamoil → Carburanti e Lubrificanti | Benefit
- Telepass/Casello/Autostrade → Viaggi e Trasferte | Costi di Gestione
- Software (Logical Soft, Blumatica, ACCA, Microsoft) → Aggiornamento Software | Costi di Gestione
- Dipendenti (Bartoloni, Greco, Rao) → Retribuzioni Dipendenti | Compensi Dipendenti
- Collaboratori (Cavallaro, Di Maita, Maggi) → Rimborso Professionisti | Compensi Esterni
- Sorgenia/luce/ACEA/ENEL → Energia Elettrica | Costi di Gestione
- Fastweb/Iliad/TIM/Very Mobile → Spese Telefonia | Costi di Gestione
- Amazon → Acquisto Beni/Strumenti Lavoro | Costi di Gestione
- Elite Supermercati/Conad/Lidl → Somministrazioni Ufficio | Costi di Gestione
- Inarcassa/F24/INPS/Erario → Tributi/INPS | Tributi
- Ristorante/Bar per lavoro → Ristorante | Marketing
- Trinchini/agenti commerciali → Consulenze Commerciali | Provvigioni Agenti
- Elle Gi Srl → Lavorazioni di Terzi | Costi General Contractor
- SUN-ENERGY → Merci c/Acquisto | Costi General Contractor
- Entrate da clienti ingegneria → Introiti | Introiti Aziendali | INGEGNERIA
- Entrate da cantieri FTV → Introiti | Introiti Aziendali | GENERAL CONTRACTOR
- Giffi Marco compenso → Migliorie beni terzi | Compenso MG
- Barone Marco → Rimborso Professionisti | Compenso MB
- Imposta di bollo/bollo cc → Imposta di Bollo | Costi di Gestione
- Commissioni bancarie/spese conto → Spese Bancarie | Costi di Gestione
- Poste Italiane → Valori Bollati | Costi di Gestione
- UnipolTech/RC Polizza → Assicurazioni Varie | Costi di Gestione

ATTIVITÀ: INGEGNERIA o GENERAL CONTRACTOR
`

export async function POST(req: NextRequest) {
  try {
    const { movimenti } = await req.json()
    if (!movimenti || !Array.isArray(movimenti)) {
      return NextResponse.json({ error: 'Nessun movimento' }, { status: 400 })
    }

    const supabase = createClient()

    // ═══════════════════════════════════════════════
    // APPROCCIO 1: Carica regole apprese dal database
    // ═══════════════════════════════════════════════
    const { data: regole } = await supabase
      .from('regole_categorizzazione')
      .select('*')
      .order('contatore', { ascending: false })

    const mappaRegole = new Map<string, any>()
    if (regole) {
      regole.forEach((r: any) => mappaRegole.set(r.chiave.toLowerCase(), r))
    }

    // ═══════════════════════════════════════════════
    // APPROCCIO 2: Carica ultimi 80 movimenti come esempi
    // ═══════════════════════════════════════════════
    const { data: esempi } = await supabase
      .from('prima_nota')
      .select('descrizione, mittente_fornitore, importo, voci_bilancio, macro_categoria, attivita, nome_progetto, youdox')
      .not('macro_categoria', 'is', null)
      .order('created_at', { ascending: false })
      .limit(80)

    const esempioContesto = esempi && esempi.length > 0
      ? `\nESEMPI DAL TUO STORICO (usa questi come riferimento prioritario):\n` +
        esempi.slice(0, 40).map((e: any) =>
          `"${e.descrizione || e.mittente_fornitore}" → ${e.voci_bilancio} | ${e.macro_categoria}${e.attivita ? ' | ' + e.attivita : ''}`
        ).join('\n')
      : ''

    const risultati: any[] = []
    const nuoveRegole: any[] = []

    for (let i = 0; i < movimenti.length; i += 20) {
      const batch = movimenti.slice(i, i + 20)
      const batchRisultati: any[] = []
      const daChiedereAI: Array<{ idx: number; mov: any }> = []

      // Applica regole apprese (Approccio 1)
      for (let j = 0; j < batch.length; j++) {
        const mov = batch[j]
        const desc = (mov.descrizione || '').toLowerCase()
        const mit = (mov.mittente_fornitore || '').toLowerCase()

        let regolaMatch: any = null

        // Cerca corrispondenza nelle regole — prima exact match, poi partial
        const regoleArray = Array.from(mappaRegole.entries())
        for (let ri = 0; ri < regoleArray.length; ri++) {
          const [chiave, regola] = regoleArray[ri]
          if (chiave.length > 3 && (desc.includes(chiave) || mit.includes(chiave))) {
            regolaMatch = regola
            break
          }
        }

        if (regolaMatch) {
          // Trovata regola appresa — categorizza subito senza chiamare AI
          batchRisultati.push({
            indice: i + j,
            voci_bilancio: regolaMatch.voci_bilancio,
            macro_categoria: regolaMatch.macro_categoria,
            spesa_societaria: regolaMatch.spesa_societaria,
            attivita: regolaMatch.attivita,
            nome_progetto: regolaMatch.nome_progetto,
            youdox: regolaMatch.youdox,
            da_regola: true,
          })
        } else {
          // Non trovata — manda all'AI
          daChiedereAI.push({ idx: i + j, mov })
        }
      }

      // Chiama AI solo per movimenti senza regola (Approccio 2 + legenda)
      if (daChiedereAI.length > 0) {
        const prompt = `${LEGENDA_CONTEXT}${esempioContesto}

Categorizza questi ${daChiedereAI.length} movimenti. Rispondi SOLO con JSON array:
[{"indice":0,"voci_bilancio":"...","macro_categoria":"...","spesa_societaria":"...","flusso":"ENTRATE|USCITE|GIROCONTO","attivita":"INGEGNERIA|GENERAL CONTRACTOR|null","nome_progetto":null,"tipo_attivita":null,"youdox":true|false}, ...]

MOVIMENTI:
${daChiedereAI.map(({ idx, mov }, localIdx) =>
  `${localIdx}. [idx_reale:${idx}] €${mov.importo} | "${mov.descrizione || ''}" | ${mov.mittente_fornitore || ''} | ${mov.data_contabile || ''}`
).join('\n')}`

        try {
          const res = await client.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 4000,
            messages: [{ role: 'user', content: prompt }]
          })

          const text = res.content[0].type === 'text' ? res.content[0].text : ''
          const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())

          // Mappa gli indici locali agli indici reali
          parsed.forEach((r: any, localIdx: number) => {
            const { idx, mov } = daChiedereAI[localIdx] || daChiedereAI[0]
            const risultato = { ...r, indice: idx }
            batchRisultati.push(risultato)

            // Prepara nuova regola da salvare (Approccio 1 — apprendi)
            if (r.macro_categoria && r.voci_bilancio) {
              const desc = (mov.descrizione || '').toLowerCase().trim()
              const mit = (mov.mittente_fornitore || '').toLowerCase().trim()
              const chiave = mit.length > 3 ? mit.substring(0, 30) : desc.substring(0, 30)
              if (chiave.length > 3) {
                nuoveRegole.push({
                  chiave,
                  voci_bilancio: r.voci_bilancio,
                  macro_categoria: r.macro_categoria,
                  spesa_societaria: r.spesa_societaria || null,
                  attivita: r.attivita || null,
                  nome_progetto: r.nome_progetto || null,
                  youdox: r.youdox || false,
                  contatore: 1,
                })
              }
            }
          })
        } catch {
          daChiedereAI.forEach(({ idx }) => {
            batchRisultati.push({ indice: idx })
          })
        }
      }

      risultati.push(...batchRisultati)
    }

    // ═══════════════════════════════════════════════
    // Salva nuove regole apprese nel database
    // ═══════════════════════════════════════════════
    if (nuoveRegole.length > 0) {
      for (const regola of nuoveRegole) {
        const esiste = mappaRegole.get(regola.chiave)
        if (esiste) {
          // Aggiorna contatore — la regola si rafforza
          await supabase
            .from('regole_categorizzazione')
            .update({ contatore: (esiste.contatore || 1) + 1, updated_at: new Date().toISOString() })
            .eq('chiave', regola.chiave)
        } else {
          // Inserisci nuova regola
          await supabase.from('regole_categorizzazione').insert(regola)
        }
      }
    }

    return NextResponse.json({ risultati, regole_applicate: risultati.filter((r: any) => r.da_regola).length })

  } catch (error: any) {
    console.error('Errore categorizzazione:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
