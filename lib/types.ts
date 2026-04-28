export type Flusso = 'ENTRATE' | 'USCITE' | 'GIROCONTO'
export type Attivita = 'INGEGNERIA' | 'GENERAL CONTRACTOR'
export type Cassa = 'FIDEURAM' | 'UNICREDIT' | 'REVOLUT ATHENA'
export type Trimestre = 'Q1' | 'Q2' | 'Q3' | 'Q4'
export type Mese = 'Gen' | 'Feb' | 'Mar' | 'Apr' | 'Mag' | 'Giu' | 'Lug' | 'Ago' | 'Set' | 'Ott' | 'Nov' | 'Dic'

export type MovimentoPrimaNota = {
  id: string
  trimestre: Trimestre | null
  mese: Mese | null
  anno: number | null
  competenza: number | null
  data_contabile: string | null
  youdox: boolean
  canale: string | null
  voci_bilancio: string | null
  macro_categoria: string | null
  n_protocollo: string | null
  data_valuta: string | null
  importo: number
  descrizione: string | null
  mittente_fornitore: string | null
  cliente_destinatario: string | null
  cassa: Cassa | null
  spesa_societaria: string | null
  flusso: Flusso | null
  attivita: Attivita | null
  nome_progetto: string | null
  tipo_attivita: string | null
  portafoglio: string | null
  fattura_id: string | null
  created_at: string
  updated_at: string
}

export type Fattura = {
  id: string
  tipo: 'ATTIVA' | 'PASSIVA'
  numero: string | null
  data_fattura: string | null
  fornitore_cliente: string | null
  partita_iva: string | null
  imponibile: number | null
  iva: number | null
  totale: number | null
  cassa: Cassa | null
  descrizione: string | null
  nome_progetto: string | null
  pdf_url: string | null
  movimento_id: string | null
  ai_estratto: boolean
  created_at: string
}

export type SpesaRicorrente = {
  id: string
  descrizione: string
  importo: number
  frequenza: 'mensile' | 'trimestrale' | 'annuale'
  giorno_del_mese: number | null
  categoria: string | null
  cassa: Cassa | null
  attivo: boolean
}
