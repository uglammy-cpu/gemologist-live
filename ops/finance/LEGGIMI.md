# FINANCE — contatore LiveKit e report di fine diretta

FINANCE è l'agente dei conti di Uniqaia. Il ruolo è nel progetto claude.ai «Uniqaia - live», in `claude/finance/finance.md`; i report sono in `claude/finance/report-dirette.md`. Decisione di Elena del 6 novembre 2026: FINANCE lavora solo alla fine di ogni diretta vera, fa un report per diretta e riporta sempre a Gilda.

Il contatore e la coda costano 0 €: girano su Supabase (piano Free) e su un webhook di LiveKit Cloud. Claude entra in gioco solo quando parte l'agente, a fine diretta.

## Cosa c'è

- `ops/supabase/functions/finance-livekit/index.ts` — edge function `finance-livekit` (verify_jwt disattivato: l'autenticità la garantisce la firma del webhook).
  - Verifica il token JWT HS256 di LiveKit: l'emittente deve essere la chiave API e lo `sha256` deve corrispondere al corpo.
  - Tiene solo id evento, tipo, stanza e partecipante (sid, identità tecnica, tipo, orario di ingresso) e chiama `public.finance_livekit_ingest`.
  - Alla chiusura di una stanza (`room_finished`) prende le dirette vere in coda e avvia l'agente FINANCE con l'avvio via API dell'attività pianificata. Lo fa solo se sono impostati i segreti `FINANCE_FIRE_URL` (solo `https://api.anthropic.com/…`) e `FINANCE_FIRE_TOKEN`.
- `ops/finance/sql/2026-11-06_finance_contatore.sql` — migrazione `finance_contatore_livekit`:
  - schema `finance`, chiuso ad anon e authenticated, con RLS attiva;
  - tabelle `lk_rooms`, `lk_participants`, `lk_events` (deduplica);
  - vista `lk_presenze`;
  - funzione `finance.livekit_mese()`;
  - pulizia notturna `finance-pulizia` (eventi oltre 90 giorni).
- `ops/finance/sql/2026-11-06b_finance_report_dirette.sql` — migrazioni `finance_report_dirette` e `finance_report_avvio_esito_v2`:
  - tabella `finance.report_dirette`, con la coda e lo storico dei report;
  - trigger di messa in coda alla chiusura della stanza;
  - `finance.report_diretta(show)`, con i numeri della diretta segnati come verificato, stimato o non disponibile;
  - `finance.report_da_fare()` e `finance.report_registra(show)`;
  - le due funzioni per la edge function, solo `service_role`.

Una **diretta vera** soddisfa tre condizioni:
- il seller non è uno dei dimostrativi (rossi, ferri, lombardi, marchetti, pietrerare);
- lo show ha `started_at`;
- nella stanza c'era almeno un membro dello staff.

## Webhook su LiveKit Cloud

Il webhook è nel progetto `dirette-gioiellerie`, alla voce Settings → Webhooks → "Uniqaia FINANCE contatore".
- URL: `https://itoxzepuukyvdxxtfetf.supabase.co/functions/v1/finance-livekit`.
- È firmato con la chiave API del progetto.

## Leggere i numeri

```sql
select finance.livekit_mese();               -- mese corrente (Europe/Rome)
select finance.report_da_fare();             -- dirette vere in attesa di report
select finance.report_diretta('<show_id>');  -- numeri di una diretta
select show_id, stato, fatto_at from finance.report_dirette order by ultima_stanza_chiusa_at desc;
```

I GB sono stimati (1,5 Mbps per spettatore), non misurati: il dato misurato resta quello della console LiveKit. I prezzi usati nei calcoli sono quelli dell'audit del 6/11/2026 (campo `ipotesi`).

## Stato

L'attività «Uniqaia — FINANCE: report di fine diretta» è creata e **in pausa**, senza orario e senza avvio via API, perché non ci sono ancora dirette vere.

Per accenderla (passi in `claude/finance/finance.md`):
1. generare il token API dell'attività su claude.ai/code/routines;
2. impostare i segreti `FINANCE_FIRE_URL` e `FINANCE_FIRE_TOKEN`;
3. riattivare l'attività.

Nel frattempo le dirette vere entrano comunque in coda.
