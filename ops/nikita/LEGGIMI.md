# Nikita · affidabilità tecnica di Uniqaia

Nikita controlla che la piattaforma funzioni davvero, con test reali e prove registrate. Fa rapporto a Gilda.

## I pezzi

| Pezzo | Dove | Quando |
| --- | --- | --- |
| **Sentinella** | Supabase, schema `ops`, pg_cron (`sql/2026-11-04_nikita.sql`) | ogni 5 minuti, ogni ora, ogni giorno |
| **Collaudo con il browser** | GitHub Actions `.github/workflows/nikita.yml`, test in `tests/` | 2 volte al giorno, dopo ogni aggiornamento del sito, a mano |
| **Autotest** | `autotest.mjs` | il lunedì e quando cambiano i test: prova che i test scoprono i guasti |
| **Ricezione degli esiti** | funzione Supabase `nikita` (`ops/supabase/functions/nikita/`) | accetta solo esiti firmati da GitHub (OIDC) |
| **Rapporto** | appuntamento automatico «Nikita · rapporto» → `claude/nikita/rapporto.md` nel progetto | ogni mattina 7:41 |
| **Allarmi P0/P1** | appuntamento automatico «Gilda · allarmi urgenti» (notifica) + email via `outbox` quando Resend è attivo | ogni ora 8–23 |

## Regole

- I test **non scrivono nei dati veri**: le chiamate che scriverebbero (statistiche della ruota, ingressi, richieste, «abbonami», account) vengono intercettate in `tests/_aiuti.mjs`.
- Un problema si apre dopo N esiti negativi di fila e **si chiude solo con un nuovo esito positivo**.
- Un controllo senza esito recente vale **NOT TESTED**, mai verde.
- Nikita non modifica prezzi, premi, abbonamenti, permessi o dati reali e non pubblica codice non verificato.

## Comandi utili (SQL, solo lettura salvo dove indicato)

```sql
select ops.report();                    -- stato completo
select ops.alerts_pending();            -- allarmi P0/P1 da inoltrare
select ops.run('5m');                   -- giro manuale della sentinella (scrive solo nello schema ops)
select id, last_status, last_detail->>'reason' from ops.checks order by area, id;
```

## Lanciare il collaudo a mano

GitHub → Actions → **Nikita · collaudo** → Run workflow (spunta «autotest» per la prova con i guasti simulati).
