import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Contesto della legenda estratto dall'Excel
const LEGENDA_CONTEXT = `
Sei il sistema di categorizzazione contabile di Athena Next Gen S.r.l., studio di ingegneria.

VOCI DI BILANCIO COMUNI:
- Affitto Ufficio → Canoni di Locazione | Costi di Gestione
- Auto aziendale (ARVAL) → Noleggio Mezzi Aziendali | Benefit MG
- Carburante → Carburanti e Lubrificanti | Benefit
- Casello/Telepass → Viaggi e Trasferte | Costi di Gestione
- Software (Logical Soft, Blumatica, ACCA) → Aggiornamento e Manutenzione Software | Costi di Gestione
- Dipendenti (Bartoloni, Greco, Rao) → Retribuzioni Dipendenti | Compensi Dipendenti
- Collaboratori (Cavallaro, Di Maita) → Rimborso Professionisti | Compensi Dipendenti
- Sorgenia/luce → Energia Elettrica | Costi di Gestione
- Fastweb/Iliad/TIM → Spese Telefonia | Costi di Gestione
- Amazon acquisti ufficio → varia in base al prodotto
- Elite Supermercati (ufficio) → Somministrazioni in Ufficio | Costi di Gestione
- Inarcassa/F24 → Tributi/INPS
- Condominio → Spese Condominiali su Immobili di terzi | Costi di Gestione
- Ristorante per lavoro → Ristorante | Marketing
- Provvigioni (Trinchini) → Consulenze Commerciali | Provvigioni Agenti
- Elle Gi Srl → Lavorazioni di Terzi | Costi General Contractor (FTV)
- SUN-ENERGY → Merci c/Acquisto | Costi General Contractor (FTV)
- Entrate da clienti ingegneria → Introiti | Introiti Aziendali | INGEGNERIA
- Entrate da cantieri FTV → Introiti | Introiti Aziendali | GENERAL CONTRACTOR
- Giffi Marco (compenso) → Migliorie e spese incrementative beni terzi | Compenso MG
- Barone Marco → Rimborso Professionisti | Compenso MB
- I.B.O. Roma → Canoni di Locazione | Costi di Gestione (affitto ufficio)
- Formazione → Spese per Addestramento e formazione personale | Formazione
- Assicurazioni → Assicurazioni Varie | Costi di Gestione

ATTIVITÀ:
- INGEGNERIA: pratiche, progettazione, APE, ENEA, collaudi, servizi tecnici
- GENERAL CONTRACTOR: cantieri FTV chiavi in mano, installazione impianti

CASSE: FIDEURAM (principale), UNICREDIT (secondario)
`

export async function POST(req: NextRequest) {
  try {
    const { movimenti } = await req.json()

    if (!movimenti || !Array.isArray(movimenti)) {
      return NextResponse.json({ error: 'Nessun movimento fornito' }, { status: 400 })
    }

    // Processo in batch da 20 alla volta
    const risultati: any[] = []

    for (let i = 0; i < movimenti.length; i += 20) {
      const batch = movimenti.slice(i, i + 20)

      const prompt = `${LEGENDA_CONTEXT}

Categorizza questi ${batch.length} movimenti bancari. Per ognuno restituisci un JSON array con questi campi:
- indice: numero progressivo (0,1,2...)
- voci_bilancio: voce di bilancio
- macro_categoria: macro categoria
- spesa_societaria: voce spesa societaria
- flusso: "ENTRATE" o "USCITE" o "GIROCONTO"
- attivita: "INGEGNERIA" o "GENERAL CONTRACTOR" (null se non determinabile)
- nome_progetto: se riconoscibile dal contesto (null altrimenti)
- tipo_attivita: tipo specifico di attività
- youdox: true se sembra una fattura protocollabile, false altrimenti

MOVIMENTI DA CATEGORIZZARE:
${batch.map((m: any, idx: number) => `${idx}. Importo: ${m.importo} | Descrizione: "${m.descrizione}" | Mittente/Dest: "${m.mittente_fornitore || m.cliente_destinatario || ''}" | Data: ${m.data_contabile}`).join('\n')}

Rispondi SOLO con il JSON array, senza altro testo o markdown.`

      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }]
      })

      const text = response.content[0].type === 'text' ? response.content[0].text : ''
      const clean = text.replace(/```json|```/g, '').trim()

      try {
        const parsed = JSON.parse(clean)
        risultati.push(...parsed)
      } catch {
        // Se il parsing fallisce, aggiungi risultati vuoti
        batch.forEach((_: any, idx: number) => {
          risultati.push({ indice: i + idx, voci_bilancio: null, macro_categoria: null })
        })
      }
    }

    return NextResponse.json({ risultati })

  } catch (error: any) {
    console.error('Errore categorizzazione:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
