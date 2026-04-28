import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { righe_header, righe_dati, nome_file } = await req.json()

    if (!righe_header || !righe_dati) {
      return NextResponse.json({ error: 'Dati mancanti' }, { status: 400 })
    }

    // Step 1: Claude capisce la struttura del file
    const mappingPrompt = `Sei un esperto contabile italiano. Devi analizzare un estratto conto bancario o prima nota in Excel e mappare le colonne sui campi del gestionale.

FILE: ${nome_file}

RIGA HEADER (indice 0 = prima colonna):
${righe_header.map((h: string, i: number) => `${i}: "${h}"`).join('\n')}

PRIME 3 RIGHE DATI (per capire il formato):
${righe_dati.slice(0, 3).map((r: any[], i: number) => `Riga ${i+1}: ${JSON.stringify(r)}`).join('\n')}

CAMPI DEL GESTIONALE da popolare:
- data_contabile: data dell'operazione (formato YYYY-MM-DD)
- data_valuta: data valuta se presente
- importo: importo numerico (NEGATIVO per uscite, POSITIVO per entrate)
- descrizione: descrizione/causale dell'operazione
- mittente_fornitore: chi ha inviato il denaro o il fornitore
- cliente_destinatario: chi ha ricevuto o il cliente
- cassa: nome del conto/banca (es: FIDEURAM, UNICREDIT)
- flusso: "ENTRATE" o "USCITE" o "GIROCONTO"
- voci_bilancio: voce di bilancio se presente
- macro_categoria: macro categoria se presente
- nome_progetto: progetto associato se presente
- attivita: "INGEGNERIA" o "GENERAL CONTRACTOR" se presente
- portafoglio: portafoglio se presente
- youdox: true/false se presente
- canale: canale se presente

Rispondi SOLO con un JSON così (usa null se la colonna non esiste):
{
  "cassa_default": "nome della banca/conto dedotto dal file o null",
  "mapping": {
    "data_contabile": <indice colonna o null>,
    "data_valuta": <indice colonna o null>,
    "importo": <indice colonna o null>,
    "importo_dare": <indice colonna separata dare o null>,
    "importo_avere": <indice colonna separata avere o null>,
    "descrizione": <indice colonna o null>,
    "mittente_fornitore": <indice colonna o null>,
    "cliente_destinatario": <indice colonna o null>,
    "cassa": <indice colonna o null>,
    "flusso": <indice colonna o null>,
    "voci_bilancio": <indice colonna o null>,
    "macro_categoria": <indice colonna o null>,
    "nome_progetto": <indice colonna o null>,
    "attivita": <indice colonna o null>,
    "portafoglio": <indice colonna o null>,
    "youdox": <indice colonna o null>,
    "canale": <indice colonna o null>,
    "spesa_societaria": <indice colonna o null>
  },
  "riga_header": <indice riga header nel file, di solito 0>,
  "note": "breve spiegazione del formato rilevato"
}`

    const mappingRes = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: mappingPrompt }]
    })

    const mappingText = mappingRes.content[0].type === 'text' ? mappingRes.content[0].text : ''
    const mappingClean = mappingText.replace(/```json|```/g, '').trim()
    const mapping = JSON.parse(mappingClean)

    return NextResponse.json({ mapping })

  } catch (error: any) {
    console.error('Errore mapping Excel:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
