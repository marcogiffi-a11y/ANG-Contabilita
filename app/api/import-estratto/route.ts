import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { movimenti } = await req.json()

    if (!movimenti || !Array.isArray(movimenti)) {
      return NextResponse.json({ error: 'Dati non validi' }, { status: 400 })
    }

    const supabase = createClient()

    // Inserimento in batch
    const { data, error } = await supabase
      .from('prima_nota')
      .insert(movimenti)
      .select('id')

    if (error) throw error

    return NextResponse.json({ 
      inseriti: data?.length || 0,
      message: `${data?.length} movimenti importati con successo`
    })

  } catch (error: any) {
    console.error('Errore import:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
