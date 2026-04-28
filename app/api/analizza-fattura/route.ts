import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const LEGENDA_CONTEXT = `
Sei il sistema di categorizzazione contabile di Athena Next Gen S.r.l., studio di ingegneria fotovoltaica.

VOCI DI BILANCIO COMUNI:
- Affitto Ufficio/I.B.O. Roma → Canoni di Locazione | Costi di Gestione
- ARVAL (auto) → Noleggio Mezzi Aziendali | Benefit MG
- Carburante → Carburanti e Lubrificanti | Benefit
- Telepass/Casello → Viaggi e Trasferte | Costi di Gestione
- Software (Logical Soft, Blumatica, ACCA) → Aggiornamento Software | Costi di Gestione
- Dipendenti (Bartoloni, Greco, Rao) → Retribuzioni Dipendenti | Compensi
- Collaboratori (Cavallaro, Di Maita) → Rimborso Professionisti | Compensi
- Sorgenia/luce → Energia Elettrica | Costi di Gestione
- Fastweb/Iliad/TIM → Spese Telefonia | Costi di Gestione
- Amazon → varia in base al prodotto
- Elite Supermercati → Somministrazioni Ufficio | Costi di Gestione
- Inarcassa/F24 → Tributi/INPS
- Ristorante lavoro → Ristorante | Marketing
- Trinchini → Consulenze Commerciali | Provvigioni
- Elle Gi Srl → Lavorazioni di Terzi | Costi GC
- SUN-ENERGY → Merci c/Acquisto | Costi GC
- Entrate clienti ingegneria → Introiti | INGEGNERIA
- Entrate cantieri FTV → Introiti | GENERAL CONTRACTOR
- Giffi Marco compenso → Compenso MG
- Barone Marco → Rimborso Professionisti | Compenso MB

ATTIVITÀ: INGEGNERIA o GENERAL CONTRACTOR
`

export async function POST(req: NextRequest) {
  try {
    const { movimenti } = await req.json()
    if (!movimenti || !Array.isArray(movimenti)) return NextResponse.json({ error: 'Nessun movimento' }, { status: 400 })

    const risultati: any[] = []

    for (let i = 0; i < movimenti.length; i += 20) {
      const batch = movimenti.slice(i, i + 20)

      const prompt = `${LEGENDA_CONTEXT}

Categorizza questi movimenti bancari. Rispondi SOLO con JSON array:
[{"indice":0,"voci_bilancio":"...","macro_categoria":"...","spesa_societaria":"...","flusso":"ENTRATE|USCITE|GIROCONTO","attivita":"INGEGNERIA|GENERAL CONTRACTOR|null","nome_progetto":"...|null","tipo_attivita":"...|null","youdox":true|false}, ...]

MOVIMENTI:
${batch.map((m: any, idx: number) => `${idx}. €${m.importo} | "${m.descrizione}" | ${m.mittente_fornitore || m.cliente_destinatario || ''} | ${m.data_contabile}`).join('\n')}`

      const res = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }]
      })

      const text = res.content[0].type === 'text' ? res.content[0].text : ''
      try {
        const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
        // Aggiusta indici per il batch
        parsed.forEach((r: any) => { r.indice = i + r.indice })
        risultati.push(...parsed)
      } catch {
        batch.forEach((_: any, idx: number) => risultati.push({ indice: i + idx }))
      }
    }

    return NextResponse.json({ risultati })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
