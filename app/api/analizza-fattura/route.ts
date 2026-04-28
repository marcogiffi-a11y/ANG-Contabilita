import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'Nessun file fornito' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: base64
            }
          } as any,
          {
            type: 'text',
            text: `Analizza questa fattura italiana ed estrai i dati. 
Rispondi SOLO con un JSON con questi campi (null se non trovato):
{
  "tipo": "ATTIVA" o "PASSIVA" (ATTIVA se Athena Next Gen è il mittente/emittente, PASSIVA se è il destinatario),
  "numero": numero fattura,
  "data_fattura": data in formato YYYY-MM-DD,
  "fornitore_cliente": nome azienda/persona (NON Athena Next Gen),
  "partita_iva": P.IVA del fornitore/cliente,
  "imponibile": importo imponibile (numero),
  "iva": importo IVA (numero),
  "totale": totale fattura (numero),
  "descrizione": descrizione sintetica del servizio/prodotto,
  "nome_progetto": se è menzionato un progetto specifico
}
Nessun testo aggiuntivo, solo JSON.`
          }
        ]
      }]
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const clean = text.replace(/```json|```/g, '').trim()

    let dati
    try {
      dati = JSON.parse(clean)
    } catch {
      // Se il parsing fallisce, restituisci dati vuoti
      dati = { tipo: 'PASSIVA' }
    }

    return NextResponse.json({ dati })

  } catch (error: any) {
    console.error('Errore analisi fattura:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
