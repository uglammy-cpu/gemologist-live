-- FINANCE — report di fine diretta (6 novembre 2026, autorizzato da Elena)
-- Quando si chiude la stanza LiveKit di una diretta vera (seller non dimostrativo, show andato in onda,
-- almeno un membro dello staff collegato) la diretta entra in coda in finance.report_dirette.
-- La funzione finance-livekit avvia l'agente FINANCE; l'agente calcola i numeri con finance.report_diretta(),
-- scrive il report per Gilda e lo registra con finance.report_registra() (storico).
-- Solo aggiunte: nessuna modifica a tabelle o dati esistenti dello schema public.

create table if not exists finance.report_dirette (
  show_id                 uuid primary key,
  seller_slug             text not null,
  messo_in_coda_at        timestamptz not null default now(),
  ultima_stanza_chiusa_at timestamptz,
  stato                   text not null default 'da_fare' check (stato in ('da_fare', 'da_aggiornare', 'fatto')),
  avviato_at              timestamptz,
  avvio_esito             text,
  fatto_at                timestamptz,
  dati                    jsonb
);
alter table finance.report_dirette enable row level security;
revoke all on finance.report_dirette from public, anon, authenticated;

-- Seller dimostrativi: le loro stanze sono sempre prove
create or replace function finance.seller_demo()
returns text[] language sql immutable set search_path = pg_catalog as $$
  select array['rossi', 'ferri', 'lombardi', 'marchetti', 'pietrerare']::text[]
$$;

-- Messa in coda alla chiusura della stanza
create or replace function finance._coda_report()
returns trigger language plpgsql security definer set search_path = finance, public, pg_temp as $$
declare
  v_slug    text;
  v_started timestamptz;
begin
  if new.show_id is null or new.finished_at is null then
    return new;
  end if;
  select j.slug, s.started_at into v_slug, v_started
    from public.shows s join public.jewelers j on j.id = s.jeweler_id
   where s.id = new.show_id;
  if v_slug is null or v_slug = any (finance.seller_demo()) or v_started is null then
    return new;
  end if;
  if not exists (select 1 from finance.lk_participants p where p.room_sid = new.room_sid and p.kind = 'staff') then
    return new;
  end if;
  insert into finance.report_dirette (show_id, seller_slug, ultima_stanza_chiusa_at)
  values (new.show_id, v_slug, new.finished_at)
  on conflict (show_id) do update
    set ultima_stanza_chiusa_at = greatest(finance.report_dirette.ultima_stanza_chiusa_at, excluded.ultima_stanza_chiusa_at),
        stato      = case when finance.report_dirette.stato = 'fatto' then 'da_aggiornare' else finance.report_dirette.stato end,
        avviato_at = case when finance.report_dirette.stato = 'fatto' then null else finance.report_dirette.avviato_at end;
  return new;
end $$;
revoke all on function finance._coda_report() from public;

drop trigger if exists lk_rooms_coda_report on finance.lk_rooms;
create trigger lk_rooms_coda_report
  after update of finished_at on finance.lk_rooms
  for each row when (new.finished_at is not null and old.finished_at is distinct from new.finished_at)
  execute function finance._coda_report();

-- Per la funzione finance-livekit (solo chiave di servizio): prende le dirette da avviare e le segna come avviate
create or replace function public.finance_report_da_avviare()
returns jsonb language sql security definer set search_path = finance, public, pg_temp as $$
  with x as (
    update finance.report_dirette set avviato_at = now(), avvio_esito = null
     where stato in ('da_fare', 'da_aggiornare') and avviato_at is null
    returning show_id, seller_slug, stato
  )
  select coalesce(jsonb_agg(jsonb_build_object('show_id', show_id, 'seller', seller_slug, 'stato', stato)), '[]'::jsonb) from x
$$;
-- Esito dell'avvio: se non è riuscito la diretta torna "da avviare" e si ritenta alla prossima chiusura di stanza
create or replace function public.finance_report_avvio_esito(p_ids uuid[], p_ok boolean, p_esito text)
returns void language sql security definer set search_path = finance, public, pg_temp as $$
  update finance.report_dirette
     set avvio_esito = left(p_esito, 300),
         avviato_at = case when p_ok then avviato_at else null end
   where show_id = any (p_ids)
$$;
revoke all on function public.finance_report_da_avviare() from public, anon, authenticated;
revoke all on function public.finance_report_avvio_esito(uuid[], boolean, text) from public, anon, authenticated;
grant execute on function public.finance_report_da_avviare() to service_role;
grant execute on function public.finance_report_avvio_esito(uuid[], boolean, text) to service_role;

-- Numeri di una diretta. Ogni valore: v = valore, s = verificato | stimato | non disponibile, n = nota.
-- Ipotesi di prezzo (aggiornate all'audit del 6/11/2026): LiveKit Ship a consumo 0,0005 $/min partecipante,
-- 0,12 $/GB, 0,01 $/min agente; sottotitoli ~0,008 $/min di agente; 1,5 Mbps per spettatore (720p); 1 $ = 0,87 €;
-- Stripe 1,5% + 0,25 € e Billing 0,7% a pagamento; IVA 22%.
create or replace function finance.report_diretta(p_show uuid)
returns jsonb language plpgsql stable set search_path = finance, public, pg_temp as $$
declare
  c_usd_eur     constant numeric := 0.87;
  c_min_usd     constant numeric := 0.0005;
  c_gb_usd      constant numeric := 0.12;
  c_agente_usd  constant numeric := 0.01;
  c_sottot_usd  constant numeric := 0.008;
  c_gb_per_min  constant numeric := 1.5 * 60 / 8 / 1000;  -- GB per minuto-spettatore a 1,5 Mbps
  s             record;
  sub           record;
  m             jsonb;
  v_inizio      timestamptz;
  v_fine        timestamptz;
  v_sessioni    int;
  v_durata      numeric;
  v_min_staff   numeric;
  v_min_spett   numeric;
  v_min_altro   numeric;
  v_min_agente  numeric;
  v_conn_spett  int;
  v_connessi    int;
  v_picco       int;
  v_gb          numeric;
  v_costo_usd   numeric;
  v_canone      numeric;
  v_dirette_mese int;
  v_iva         text;
  v_budget      numeric;
  v_budget_deciso boolean;
  v_ricavo      jsonb;
  v_netto_incl  numeric;
  v_netto_escl  numeric;
  v_costo_eur   numeric;
  v_mese_costi  numeric;
  v_mese_n      int;
  v_avvisi      jsonb := '[]'::jsonb;
  v_pct         numeric;
  k             text;
begin
  select sh.id, sh.title, sh.scheduled_at, sh.started_at, sh.ended_at, sh.status, sh.duration_min, sh.lang,
         j.id as jeweler_id, j.slug, j.name
    into s
    from public.shows sh join public.jewelers j on j.id = sh.jeweler_id
   where sh.id = p_show;
  if s.id is null then
    return jsonb_build_object('errore', 'diretta non trovata');
  end if;

  select min(coalesce(r.started_at, (select min(p.joined_at) from finance.lk_participants p where p.room_sid = r.room_sid))),
         max(r.finished_at), count(*)
    into v_inizio, v_fine, v_sessioni
    from finance.lk_rooms r where r.show_id = p_show;
  v_durata := greatest(0, extract(epoch from (coalesce(v_fine, now()) - v_inizio)) / 60.0);

  select coalesce(sum(minuti) filter (where kind = 'staff'), 0),
         coalesce(sum(minuti) filter (where kind = 'viewer'), 0),
         coalesce(sum(minuti) filter (where kind in ('altro', 'egress', 'ingress')), 0),
         coalesce(sum(minuti) filter (where kind = 'agent'), 0),
         count(*) filter (where kind = 'viewer'),
         count(*) filter (where ancora_connesso)
    into v_min_staff, v_min_spett, v_min_altro, v_min_agente, v_conn_spett, v_connessi
    from finance.lk_presenze where show_id = p_show;

  with ev as (
    select joined_at as t, 1 as d from finance.lk_participants where show_id = p_show and kind = 'viewer'
    union all
    select coalesce(left_at, now()), -1 from finance.lk_participants where show_id = p_show and kind = 'viewer'
  ), run as (select sum(d) over (order by t, d rows unbounded preceding) as n from ev)
  select coalesce(max(n), 0) into v_picco from run;

  v_gb := v_min_spett * c_gb_per_min;
  v_costo_usd := (v_min_staff + v_min_spett + v_min_altro) * c_min_usd + v_gb * c_gb_usd
               + v_min_agente * (c_agente_usd + c_sottot_usd);
  v_costo_eur := v_costo_usd * c_usd_eur;

  -- Ricavo Uniqaia attribuibile: quota del canone del seller per una diretta (mai le vendite del seller)
  select b.status, b.livemode, b.first_month_cents, b.standard_cents, b.activated_at, b.current_period_start
    into sub
    from public.subscriptions b where b.jeweler_id = s.jeweler_id
   order by (b.status in ('active', 'past_due')) desc, b.updated_at desc limit 1;
  select nullif(value, '')::int into v_dirette_mese from public.app_config where key = 'PLAN_LIVES_PER_MONTH';
  v_dirette_mese := coalesce(v_dirette_mese, 4);
  select lower(value) into v_iva from public.app_config where key = 'FINANCE_IVA';
  select nullif(value, '')::numeric into v_budget from public.app_config where key = 'FINANCE_BUDGET_EUR';
  v_budget_deciso := v_budget is not null;
  v_budget := coalesce(v_budget, 150);

  if sub.status is null then
    v_ricavo := jsonb_build_object('stato_abbonamento', jsonb_build_object('v', 'nessun abbonamento', 's', 'verificato'),
      'quota_per_diretta_eur', jsonb_build_object('v', 0, 's', 'verificato', 'n', 'il seller non ha un abbonamento: nessun ricavo Uniqaia'));
  elsif sub.status not in ('active', 'past_due') or not coalesce(sub.livemode, false) then
    v_ricavo := jsonb_build_object('stato_abbonamento', jsonb_build_object('v', sub.status || case when not coalesce(sub.livemode, false) then ' (modalità di prova Stripe)' else '' end, 's', 'verificato'),
      'quota_per_diretta_eur', jsonb_build_object('v', 0, 's', 'verificato', 'n', 'abbonamento non attivo o non reale: nessun ricavo Uniqaia'));
  else
    v_canone := case when sub.first_month_cents is not null and sub.activated_at is not null and sub.current_period_start is not null
                          and sub.current_period_start <= sub.activated_at + interval '1 day'
                     then sub.first_month_cents else sub.standard_cents end / 100.0;
    v_netto_incl := (v_canone / 1.22 - (v_canone * 0.022 + 0.25)) / v_dirette_mese;
    v_netto_escl := (v_canone - (v_canone * 1.22 * 0.022 + 0.25)) / v_dirette_mese;
    v_ricavo := jsonb_build_object(
      'stato_abbonamento', jsonb_build_object('v', sub.status, 's', 'verificato', 'n', case when sub.status = 'past_due' then 'pagamento in ritardo: ricavo a rischio' end),
      'canone_periodo_eur', jsonb_build_object('v', round(v_canone, 2), 's', 'stimato', 'n', 'dal registro abbonamenti; la cifra incassata vera è sulla fattura Stripe'),
      'quota_per_diretta_lorda_eur', jsonb_build_object('v', round(v_canone / v_dirette_mese, 2), 's', 'stimato', 'n', 'canone diviso ' || v_dirette_mese || ' dirette incluse'),
      'quota_per_diretta_netta_eur', case
        when v_iva = 'inclusa' then jsonb_build_object('v', round(v_netto_incl, 2), 's', 'stimato', 'n', 'IVA inclusa nel prezzo, commissioni Stripe tolte')
        when v_iva = 'esclusa' then jsonb_build_object('v', round(v_netto_escl, 2), 's', 'stimato', 'n', 'IVA esclusa dal prezzo, commissioni Stripe tolte')
        else jsonb_build_object('v', null, 's', 'non disponibile', 'n', 'IVA non decisa: ' || round(v_netto_incl, 2) || ' € se inclusa, ' || round(v_netto_escl, 2) || ' € se esclusa') end);
  end if;

  m := finance.livekit_mese((coalesce(v_fine, now()) at time zone 'Europe/Rome')::date);
  select count(*), coalesce(sum((r.dati->'costi'->'costo_pieno_eur'->>'v')::numeric), 0)
    into v_mese_n, v_mese_costi
    from finance.report_dirette r
   where r.show_id <> p_show and r.dati is not null
     and date_trunc('month', r.ultima_stanza_chiusa_at at time zone 'Europe/Rome') = date_trunc('month', coalesce(v_fine, now()) at time zone 'Europe/Rome');
  v_mese_n := v_mese_n + 1;
  v_mese_costi := v_mese_costi + v_costo_eur;

  foreach k in array array['quota_build_minuti_pct', 'quota_build_agente_pct'] loop
    v_pct := (m->>k)::numeric;
    if v_pct >= 50 then
      v_avvisi := v_avvisi || jsonb_build_object('soglia', case when v_pct >= 90 then 90 when v_pct >= 75 then 75 else 50 end,
        'voce', case k when 'quota_build_minuti_pct' then 'minuti partecipante del piano LiveKit Build' else 'minuti agente del piano LiveKit Build' end,
        'pct', v_pct);
    end if;
  end loop;
  v_pct := round(100 * (m->>'minuti_agente')::numeric * c_sottot_usd / 2.50, 1);
  if v_pct >= 50 then
    v_avvisi := v_avvisi || jsonb_build_object('soglia', case when v_pct >= 90 then 90 when v_pct >= 75 then 75 else 50 end,
      'voce', 'crediti di inferenza LiveKit (sottotitoli), stima', 'pct', v_pct);
  end if;
  v_pct := round(100 * v_mese_costi / v_budget, 1);
  if v_pct >= 50 then
    v_avvisi := v_avvisi || jsonb_build_object('soglia', case when v_pct >= 90 then 90 when v_pct >= 75 then 75 else 50 end,
      'voce', 'budget mensile delle dirette (' || v_budget || ' €' || case when v_budget_deciso then '' else ', proposto e non ancora deciso' end || ')', 'pct', v_pct);
  end if;

  return jsonb_build_object(
    'diretta', jsonb_build_object(
      'show_id', s.id, 'titolo', s.title, 'seller', s.name, 'seller_slug', s.slug,
      'prova', s.slug = any (finance.seller_demo()),
      'programmata', s.scheduled_at, 'in_onda_dal', s.started_at, 'conclusa', s.ended_at, 'stato_show', s.status,
      'durata_prevista_min', s.duration_min,
      'stanza_aperta', jsonb_build_object('v', v_inizio, 's', case when v_inizio is null then 'non disponibile' else 'verificato' end),
      'stanza_chiusa', jsonb_build_object('v', v_fine, 's', case when v_fine is null then 'non disponibile' else 'verificato' end, 'n', case when v_fine is null then 'stanza non ancora chiusa' end),
      'sessioni_stanza', v_sessioni,
      'durata_stanza_min', jsonb_build_object('v', round(v_durata), 's', case when v_inizio is null then 'non disponibile' else 'verificato' end)),
    'pubblico', jsonb_build_object(
      'connessioni_spettatori', jsonb_build_object('v', v_conn_spett, 's', 'verificato', 'n', 'chi si ricollega conta più volte: non sono persone uniche'),
      'picco_contemporanei', jsonb_build_object('v', v_picco, 's', 'verificato'),
      'media_contemporanei', jsonb_build_object('v', case when v_durata > 0 then round(v_min_spett / v_durata, 1) end, 's', case when v_durata > 0 then 'verificato' else 'non disponibile' end),
      'ancora_connessi', jsonb_build_object('v', v_connessi, 's', 'verificato')),
    'consumi', jsonb_build_object(
      'minuti_staff', jsonb_build_object('v', round(v_min_staff), 's', 'verificato'),
      'minuti_spettatori', jsonb_build_object('v', round(v_min_spett), 's', 'verificato'),
      'minuti_agente_sottotitoli', jsonb_build_object('v', round(v_min_agente), 's', 'verificato'),
      'gb_banda', jsonb_build_object('v', round(v_gb, 2), 's', 'stimato', 'n', '1,5 Mbps per spettatore (720p); il dato misurato è nella console LiveKit')),
    'costi', jsonb_build_object(
      'costo_in_cassa_eur', jsonb_build_object('v', case when (m->>'quota_build_minuti_pct')::numeric <= 100 and (m->>'quota_build_agente_pct')::numeric <= 100 then 0 end,
        's', case when (m->>'quota_build_minuti_pct')::numeric <= 100 and (m->>'quota_build_agente_pct')::numeric <= 100 then 'stimato' else 'non disponibile' end,
        'n', 'piano LiveKit Build gratuito finché il mese resta nelle quote; la fattura vera è nella console LiveKit'),
      'costo_pieno_usd', jsonb_build_object('v', round(v_costo_usd, 3), 's', 'stimato', 'n', 'a tariffa di consumo LiveKit Ship: minuti, banda, agente e sottotitoli'),
      'costo_pieno_eur', jsonb_build_object('v', round(v_costo_eur, 2), 's', 'stimato'),
      'costo_per_spettatore_medio_eur', jsonb_build_object('v', case when v_durata > 0 and v_min_spett > 0 then round(v_costo_eur / (v_min_spett / v_durata), 3) end,
        's', case when v_durata > 0 and v_min_spett > 0 then 'stimato' else 'non disponibile' end),
      'escluso', 'costi fissi (Supabase, Workspace, domini, piano Claude) e commissioni sulle vendite dei seller, che non passano da Uniqaia'),
    'ricavo_uniqaia', v_ricavo,
    'margine_diretta_eur', case
      when (v_ricavo->'quota_per_diretta_netta_eur'->>'v') is not null
        then jsonb_build_object('v', round((v_ricavo->'quota_per_diretta_netta_eur'->>'v')::numeric - v_costo_eur, 2), 's', 'stimato', 'n', 'quota netta del canone meno costo pieno; esclusi i costi fissi')
      when (v_ricavo->'quota_per_diretta_eur'->>'v') is not null
        then jsonb_build_object('v', round(0 - v_costo_eur, 2), 's', 'stimato', 'n', 'nessun ricavo Uniqaia per questa diretta')
      else jsonb_build_object('v', null, 's', 'non disponibile', 'n', 'dipende dalla decisione sull''IVA') end,
    'mese', m || jsonb_build_object(
      'dirette_vere_con_report', v_mese_n,
      'costo_pieno_dirette_eur', jsonb_build_object('v', round(v_mese_costi, 2), 's', 'stimato'),
      'budget_eur', jsonb_build_object('v', v_budget, 's', case when v_budget_deciso then 'verificato' else 'stimato' end, 'n', case when v_budget_deciso then 'deciso da Elena' else 'proposta dell''audit, non ancora decisa da Elena' end),
      'crediti_inferenza_stimati_pct', round(100 * (m->>'minuti_agente')::numeric * c_sottot_usd / 2.50, 1)),
    'avvisi', v_avvisi,
    'ipotesi', 'LiveKit Ship a consumo 0,0005 $/min, 0,12 $/GB, 0,01 $/min agente; sottotitoli 0,008 $/min; 1,5 Mbps; 1 $ = 0,87 €; Stripe 1,5% + 0,25 € e Billing 0,7%; IVA 22%; prezzi dell''audit del 6/11/2026'
  );
end $$;
revoke all on function finance.report_diretta(uuid) from public;

-- Dirette vere in attesa di report (per l'agente e per Gilda)
create or replace function finance.report_da_fare()
returns jsonb language sql stable set search_path = finance, public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'show_id', r.show_id, 'seller', r.seller_slug, 'stato', r.stato,
           'stanza_chiusa', r.ultima_stanza_chiusa_at, 'avviato', r.avviato_at, 'esito_avvio', r.avvio_esito,
           'ore_di_attesa', round(extract(epoch from (now() - r.ultima_stanza_chiusa_at)) / 3600.0, 1))
         order by r.ultima_stanza_chiusa_at), '[]'::jsonb)
    from finance.report_dirette r where r.stato in ('da_fare', 'da_aggiornare')
$$;
revoke all on function finance.report_da_fare() from public;

-- Registra il report fatto: salva i numeri nello storico e chiude la richiesta
create or replace function finance.report_registra(p_show uuid)
returns jsonb language plpgsql set search_path = finance, public, pg_temp as $$
declare v jsonb;
begin
  if not exists (select 1 from finance.report_dirette where show_id = p_show) then
    return jsonb_build_object('errore', 'diretta non in coda');
  end if;
  v := finance.report_diretta(p_show);
  update finance.report_dirette set stato = 'fatto', fatto_at = now(), dati = v where show_id = p_show;
  return v;
end $$;
revoke all on function finance.report_registra(uuid) from public;
