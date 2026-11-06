# FINANCE — contatore LiveKit

Contatore dei minuti LiveKit, installato il 6 novembre 2026 su richiesta di Elena.
Costo: 0 €. Usa Supabase (piano Free) e un webhook di LiveKit Cloud, nessun modello Claude.

## Cosa c'è

- `ops/supabase/functions/finance-livekit/index.ts` — edge function `finance-livekit`
  (verify_jwt disattivato: l'autenticità la garantisce la firma del webhook).
  Verifica il token JWT HS256 di LiveKit (emittente = chiave API, `sha256` del corpo),
  tiene solo id evento, tipo, stanza e partecipante (sid, identità, tipo, orario di ingresso)
  e chiama `public.finance_livekit_ingest`. Nessun nome, metadato o dato personale oltre all'identità tecnica.
- `ops/finance/sql/2026-11-06_finance_contatore.sql` — migrazione `finance_contatore_livekit`:
  schema `finance` (chiuso ad anon e authenticated, RLS attiva), tabelle `lk_rooms`, `lk_participants`,
  `lk_events` (deduplica), vista `lk_presenze`, funzione `finance.livekit_mese()`,
  pulizia notturna `finance-pulizia` (eventi oltre 90 giorni).

## Webhook su LiveKit Cloud

Progetto `dirette-gioiellerie`, Settings → Webhooks → "Uniqaia FINANCE contatore",
URL `https://itoxzepuukyvdxxtfetf.supabase.co/functions/v1/finance-livekit`, firmato con la chiave API del progetto.

## Leggere i numeri

```sql
select finance.livekit_mese();               -- mese corrente (Europe/Rome)
select finance.livekit_mese('2026-12-01');   -- un altro mese
select * from finance.lk_presenze order by joined_at desc limit 50;
```

`minuti_di_prova` = stanze senza show o dei gioiellieri demo (rossi, ferri, lombardi, marchetti, pietrerare).
I GB sono stimati (1,5 Mbps per spettatore), non misurati: il dato misurato resta quello della console LiveKit.

## Cosa NON fa

Non manda avvisi e non scrive report: il Daily Financial Debrief delle 22:00 e gli avvisi al 50/75/90%
non sono attivi e aspettano l'approvazione di Elena.
