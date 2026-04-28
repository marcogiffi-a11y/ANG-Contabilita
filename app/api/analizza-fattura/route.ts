import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'Nessun file' }, { status: 400 })

    const bytes = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')

    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } } as any,
          { type: 'text', text: `Analizza questa fattura italiana. Rispondi SOLO con JSON:
{
  "tipo": "ATTIVA" o "PASSIVA",
  "numero": null,
  "data_fattura": "YYYY-MM-DD",
  "fornitore_cliente": null,
  "partita_iva": null,
  "imponibile": null,
  "iva": null,
  "totale": null,
  "descrizione": null,
  "nome_progetto": null
}` }
        ]
      }]
    })

    const text = res.content[0].type === 'text' ? res.content[0].text : ''
    let dati
    try { dati = JSON.parse(text.replace(/```json|```/g, '').trim()) }
    catch { dati = { tipo: 'PASSIVA' } }

    return NextResponse.json({ dati })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
