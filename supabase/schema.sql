-- ═══════════════════════════════════════════════════════
-- ANG CONTABILITÀ - Schema Supabase
-- ═══════════════════════════════════════════════════════

-- PRIMA NOTA
create table if not exists prima_nota (
  id uuid primary key default gen_random_uuid(),
  trimestre text,
  mese text,
  anno integer,
  competenza integer,
  data_contabile date,
  youdox boolean default false,
  canale text,
  voci_bilancio text,
  macro_categoria text,
  n_protocollo text,
  data_valuta date,
  importo numeric(12,2) not null,
  descrizione text,
  mittente_fornitore text,
  cliente_destinatario text,
  cassa text,
  spesa_societaria text,
  flusso text check (flusso in ('ENTRATE','USCITE','GIROCONTO')),
  attivita text check (attivita in ('INGEGNERIA','GENERAL CONTRACTOR')),
  nome_progetto text,
  tipo_attivita text,
  portafoglio text,
  fattura_id uuid references fatture(id) on delete set null,
  ai_categorizzato boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- FATTURE
create table if not exists fatture (
  id uuid primary key default gen_random_uuid(),
  tipo text check (tipo in ('ATTIVA','PASSIVA')) not null,
  numero text,
  data_fattura date,
  fornitore_cliente text,
  partita_iva text,
  imponibile numeric(12,2),
  iva numeric(12,2),
  totale numeric(12,2),
  cassa text,
  descrizione text,
  nome_progetto text,
  pdf_url text,
  movimento_id uuid references prima_nota(id) on delete set null,
  ai_estratto boolean default false,
  created_at timestamptz default now()
);

-- SPESE RICORRENTI (per cashflow forecast)
create table if not exists spese_ricorrenti (
  id uuid primary key default gen_random_uuid(),
  descrizione text not null,
  importo numeric(12,2) not null,
  frequenza text check (frequenza in ('mensile','trimestrale','annuale')) default 'mensile',
  giorno_del_mese integer,
  categoria text,
  cassa text,
  attivo boolean default true,
  created_at timestamptz default now()
);

-- UTENTI (semplice, senza auth complessa)
create table if not exists utenti_contabilita (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  nome text,
  ruolo text default 'editor',
  pin text,
  created_at timestamptz default now()
);

-- INDICI per performance
create index if not exists idx_prima_nota_data on prima_nota(data_contabile desc);
create index if not exists idx_prima_nota_flusso on prima_nota(flusso);
create index if not exists idx_prima_nota_cassa on prima_nota(cassa);
create index if not exists idx_prima_nota_mese_anno on prima_nota(anno, mese);
create index if not exists idx_fatture_tipo on fatture(tipo);

-- STORAGE bucket per PDF fatture
-- (da eseguire nella Console Supabase → Storage → New bucket)
-- Nome: fatture-ang | Public: false
