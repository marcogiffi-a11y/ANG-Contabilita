# ANG Contabilità

Gestionale contabilità Athena Next Gen S.r.l.

## Setup

### 1. Installa dipendenze
```bash
npm install
```

### 2. Variabili d'ambiente
Crea `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://fezkgexyvbduuurodggz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<la tua anon key da Supabase>
ANTHROPIC_API_KEY=<la tua chiave Anthropic>
```

### 3. Database Supabase
Esegui `supabase/schema.sql` nella SQL Editor di Supabase.

### 4. Storage Supabase
Crea un bucket chiamato `fatture-ang` (Settings → Storage → New Bucket).

### 5. Avvia in locale
```bash
npm run dev
```

### 6. Deploy su Vercel
Collega il repo GitHub a Vercel e aggiungi le stesse env vars.

## Struttura

- `/dashboard` — KPI: saldo conti, spese anno/mese, liquidità stimata
- `/prima-nota` — Import estratto conto Excel + categorizzazione AI automatica
- `/fatture` — Upload PDF fatture con drag & drop + estrazione dati AI

## PIN di accesso
- Marco: `1507`
- Amministrativa: `2024`
- Utente 3: `3000`
- Utente 4: `4000`
