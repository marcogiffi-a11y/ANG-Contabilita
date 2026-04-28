import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { righe_header, righe_dati, nome_file } = await req.json()
    if (!righe_header || !righe_dati) return NextResponse.json({ error: 'Dati mancanti' }, { status: 400 })

    const prompt = `Sei un esperto contabile italiano. Analizza questo file Excel bancario e mappa le colonne.

FILE: ${nome_file}
HEADER (indice: nome):
${righe_header.map((h: string, i: number) => `${i}: "${h}"`).join('\n')}

PRIME RIGHE DATI:
${righe_dati.slice(0, 3).map((r: any[], i: number) => `Riga ${i+1}: ${JSON.stringify(r)}`).join('\n')}

IMPORTANTE: 
- Se ci sono colonne separate "Accrediti" e "Addebiti" (formato Fideuram/bancario italiano), usa importo_avere per Accrediti e importo_dare per Addebiti. Lascia importo = null.
- Gli Addebiti nel formato Fideuram sono già NEGATIVI nel file.
- Se c'è una sola colonna importo, usa importo e lascia importo_dare/avere = null.
- Per "Descrizione estesa" o simili usa come mittente_fornitore.

Rispondi SOLO con JSON (null se colonna non esiste):
{
  "cassa_default": "FIDEURAM",
  "mapping": {
    "data_contabile": <indice o null>,
    "data_valuta": <indice o null>,
    "importo": <indice o null>,
    "importo_dare": <indice colonna Addebiti o null>,
    "importo_avere": <indice colonna Accrediti o null>,
    "descrizione": <indice o null>,
    "mittente_fornitore": <indice o null>,
    "cliente_destinatario": <indice o null>,
    "cassa": <indice o null>,
    "flusso": <indice o null>,
    "voci_bilancio": <indice o null>,
    "macro_categoria": <indice o null>,
    "nome_progetto": <indice o null>,
    "attivita": <indice o null>,
    "portafoglio": <indice o null>,
    "youdox": <indice o null>,
    "canale": <indice o null>,
    "spesa_societaria": <indice o null>
  }
}`

    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    })

    const text = res.content[0].type === 'text' ? res.content[0].text : ''
    const mapping = JSON.parse(text.replace(/```json|```/g, '').trim())
    return NextResponse.json({ mapping })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
