-- =====================================================================================================
-- Nikita · Software Reliability & Operations Manager di Uniqaia (4 novembre 2026)
--
-- Schema «ops»: catalogo dei controlli, esiti, registro dei problemi (P0–P3), inventario delle automazioni.
-- La sentinella gira dentro Supabase con pg_cron (ogni 5 minuti, ogni ora, ogni giorno).
-- I test con il browser girano su GitHub Actions e consegnano gli esiti alla funzione «nikita».
--
-- Regole:
--   * Tutto è chiuso al pubblico: nessun permesso ad anon e authenticated; lo schema non è esposto dall'API.
--   * I controlli leggono e basta: SELECT sul database, GET verso pagine e funzioni. Nessuna scrittura nei dati della piattaforma.
--   * Un problema si apre dopo N esiti negativi di fila (soglia per controllo) e si chiude SOLO con un nuovo esito positivo.
--   * Un controllo senza esito recente vale NOT TESTED, mai «verde».
-- =====================================================================================================

create extension if not exists pg_cron;

create schema if not exists ops;
revoke all on schema ops from public;
revoke all on schema ops from anon, authenticated;

-- ------------------------------------------------------------------ tabelle
create table if not exists ops.settings (
  key text primary key,
  value jsonb not null,
  note text,
  updated_at timestamptz not null default now()
);

create table if not exists ops.checks (
  id text primary key,
  area text not null check (area in ('sito','interfaccia','livekit','supabase','cloudflare','email','automazioni',
                                     'abbonamenti','ruota','agenti','sicurezza','prestazioni','costi','backup','nikita')),
  title text not null,
  kind text not null check (kind in ('http','sql','e2e','agent')),
  freq text not null check (freq in ('5m','1h','1d','e2e','agent')),
  severity text not null check (severity in ('P0','P1','P2','P3')),
  fail_threshold integer not null default 1 check (fail_threshold between 1 and 10),
  stale_after interval not null,
  config jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  last_status text check (last_status in ('pass','fail','partial','not_tested','error')),
  last_at timestamptz,
  last_pass_at timestamptz,
  last_fail_at timestamptz,
  last_ms integer,
  last_detail jsonb,
  consecutive_fails integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists ops.runs (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('sentinella','e2e','agente','manuale')),
  freq text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  summary jsonb
);

create table if not exists ops.results (
  id bigserial primary key,
  run_id uuid references ops.runs(id) on delete cascade,
  check_id text not null references ops.checks(id) on delete cascade,
  status text not null check (status in ('pass','fail','partial','not_tested','error')),
  ms integer,
  detail jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index if not exists results_check_at on ops.results (check_id, at desc);
create index if not exists results_at on ops.results (at);

create table if not exists ops.incidents (
  id bigserial primary key,
  check_id text references ops.checks(id) on delete set null,
  area text not null,
  severity text not null check (severity in ('P0','P1','P2','P3')),
  status text not null default 'open' check (status in ('open','resolved')),
  confidence text not null default 'verificato' check (confidence in ('verificato','sospetto')),
  title text not null,
  impact text,
  evidence jsonb,
  cause text,
  fix text,
  opened_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  occurrences integer not null default 1,
  first_result_id bigint,
  resolved_at timestamptz,
  resolved_result_id bigint,           -- l'esito positivo che ha confermato la risoluzione
  resolved_note text,
  push_sent_at timestamptz,            -- notifica sul telefono (appuntamento orario di Gilda)
  email_sent_at timestamptz,           -- email via coda outbox (solo con MAIL_MODE = live)
  resolved_push_sent_at timestamptz
);
create unique index if not exists incidents_one_open_per_check on ops.incidents (check_id) where status = 'open' and check_id is not null;
create index if not exists incidents_status on ops.incidents (status, severity);

create table if not exists ops.automations (
  id text primary key,
  name text not null,
  purpose text not null,
  trigger text not null,
  frequency text not null,
  system text not null,
  expected text not null,
  owner text not null,
  check_id text references ops.checks(id) on delete set null,
  active boolean not null default true,
  note text
);

alter table ops.settings enable row level security;
alter table ops.checks enable row level security;
alter table ops.runs enable row level security;
alter table ops.results enable row level security;
alter table ops.incidents enable row level security;
alter table ops.automations enable row level security;
revoke all on all tables in schema ops from public, anon, authenticated;
revoke all on all sequences in schema ops from public, anon, authenticated;

-- ------------------------------------------------------------------ utilità
create or replace function ops._rank(s text) returns integer language sql immutable as $$
  select case s when 'P0' then 0 when 'P1' then 1 when 'P2' then 2 when 'P3' then 3 else 9 end
$$;

create or replace function ops._setting(k text) returns jsonb language sql stable set search_path = ops as $$
  select value from ops.settings where key = k
$$;

create or replace function ops._res(p_status text, p_reason text, p_extra jsonb default '{}'::jsonb) returns jsonb
language sql immutable as $$
  select jsonb_build_object('status', p_status, 'reason', p_reason) || coalesce(p_extra, '{}'::jsonb)
$$;

-- decodifica il payload di un JWT (senza verificarne la firma: serve solo a leggere i permessi concessi)
create or replace function ops._jwt_payload(tok text) returns jsonb language plpgsql immutable as $$
declare p text := split_part(coalesce(tok, ''), '.', 2);
begin
  if p = '' then return null; end if;
  p := translate(p, '-_', '+/');
  p := p || repeat('=', (4 - length(p) % 4) % 4);
  return convert_from(decode(p, 'base64'), 'utf8')::jsonb;
exception when others then return null;
end $$;

create or replace function ops._json(t text) returns jsonb language plpgsql immutable as $$
begin return t::jsonb; exception when others then return null; end $$;

-- GET (o altro metodo) con tempo di risposta. Un errore di rete è un esito, non un'eccezione.
create or replace function ops._http(p_url text, p_headers jsonb default '{}'::jsonb, p_method text default 'GET')
returns jsonb language plpgsql volatile set search_path = ops, extensions, public as $$
declare t0 timestamptz := clock_timestamp(); r extensions.http_response; h extensions.http_header[]; loc text;
begin
  select coalesce(array_agg(extensions.http_header(k, v)), '{}') into h
    from jsonb_each_text(coalesce(p_headers, '{}'::jsonb) || jsonb_build_object('User-Agent', 'UniqaiaNikita/1.0 (+https://uniqaia.com)')) as x(k, v);
  r := extensions.http((p_method, p_url, h, null, null)::extensions.http_request);
  select x.value into loc from unnest(r.headers) x where lower(x.field) = 'location' limit 1;
  return jsonb_build_object('ok', true, 'status', r.status, 'ms', round(extract(epoch from clock_timestamp() - t0) * 1000),
                            'content_type', r.content_type, 'body', r.content, 'location', loc);
exception when others then
  return jsonb_build_object('ok', false, 'status', 0, 'ms', round(extract(epoch from clock_timestamp() - t0) * 1000), 'error', left(sqlerrm, 300));
end $$;

-- ------------------------------------------------------------------ registrazione di un esito (cuore deterministico)
create or replace function ops.record(p_check text, p_status text, p_ms integer, p_detail jsonb, p_run uuid default null)
returns bigint language plpgsql security definer set search_path = ops, public as $$
declare c ops.checks; v_res bigint; v_inc ops.incidents; v_sev text; v_title text;
begin
  if p_status not in ('pass','fail','partial','not_tested','error') then raise exception 'Stato non valido: %', p_status; end if;
  select * into c from ops.checks where id = p_check for update;
  if not found then raise exception 'Controllo sconosciuto: %', p_check; end if;

  insert into ops.results (run_id, check_id, status, ms, detail)
  values (p_run, p_check, p_status, p_ms, coalesce(p_detail, '{}'::jsonb)) returning id into v_res;

  update ops.checks set
    last_status = p_status, last_at = now(), last_ms = p_ms, last_detail = p_detail,
    last_pass_at = case when p_status = 'pass' then now() else last_pass_at end,
    last_fail_at = case when p_status in ('fail','partial') then now() else last_fail_at end,
    consecutive_fails = case when p_status in ('fail','partial') then consecutive_fails + 1
                             when p_status = 'pass' then 0 else consecutive_fails end
  where id = p_check returning * into c;

  select * into v_inc from ops.incidents where check_id = p_check and status = 'open' for update;

  if p_status in ('fail','partial') and c.consecutive_fails >= c.fail_threshold then
    -- un esito «parziale» (lento, degradato, solo dati dimostrativi) non vale più di un P2
    v_sev := case when p_status = 'partial' and ops._rank(c.severity) < 2 then 'P2' else c.severity end;
    v_title := c.title || coalesce(' — ' || nullif(p_detail->>'reason', ''), '');
    if v_inc.id is null then
      insert into ops.incidents (check_id, area, severity, title, impact, evidence, cause, fix, first_result_id)
      values (p_check, c.area, v_sev, left(v_title, 400), c.config->>'impact', p_detail, c.config->>'cause', c.config->>'fix', v_res)
      returning * into v_inc;
      if v_inc.severity in ('P0','P1') then perform ops._email_alert(v_inc.id, 'open'); end if;
    else
      update ops.incidents set
        last_seen_at = now(), occurrences = occurrences + 1, evidence = p_detail, title = left(v_title, 400),
        severity = case when ops._rank(v_sev) < ops._rank(severity) then v_sev else severity end
      where id = v_inc.id returning * into v_inc;
      -- peggiorato a P0/P1 dopo l'apertura: la notifica è dovuta anche se prima non lo era
      if v_inc.severity in ('P0','P1') and v_inc.email_sent_at is null then perform ops._email_alert(v_inc.id, 'open'); end if;
    end if;
  elsif p_status = 'pass' and v_inc.id is not null then
    update ops.incidents set status = 'resolved', resolved_at = now(), resolved_result_id = v_res,
      resolved_note = 'Risolto: nuovo test superato (' || to_char(now() at time zone 'Europe/Rome', 'DD/MM HH24:MI') || ')'
    where id = v_inc.id;
    if v_inc.email_sent_at is not null then perform ops._email_alert(v_inc.id, 'resolved'); end if;
  end if;
  return v_res;
end $$;

-- Problema trovato dall'agente (non da un controllo automatico): sospetto o verificato, con prova.
create or replace function ops.report_issue(p_area text, p_severity text, p_title text, p_evidence jsonb,
                                            p_confidence text default 'sospetto', p_fix text default null)
returns bigint language plpgsql security definer set search_path = ops as $$
declare v bigint;
begin
  if p_evidence is null or p_evidence = '{}'::jsonb then raise exception 'Serve una prova (evidence).'; end if;
  select id into v from ops.incidents where status = 'open' and check_id is null and title = p_title;
  if v is not null then
    update ops.incidents set last_seen_at = now(), occurrences = occurrences + 1, evidence = p_evidence where id = v;
    return v;
  end if;
  insert into ops.incidents (area, severity, title, evidence, confidence, fix)
  values (p_area, p_severity, p_title, p_evidence, p_confidence, p_fix) returning id into v;
  return v;
end $$;

-- Chiude un problema aperto dall'agente: solo con la prova del nuovo test che lo conferma.
create or replace function ops.resolve_issue(p_id bigint, p_evidence text) returns void
language plpgsql security definer set search_path = ops as $$
begin
  if coalesce(trim(p_evidence), '') = '' then raise exception 'Per chiudere un problema serve la prova del nuovo test.'; end if;
  update ops.incidents set status = 'resolved', resolved_at = now(), resolved_note = p_evidence
   where id = p_id and status = 'open' and check_id is null;
  if not found then raise exception 'Problema % non aperto o legato a un controllo automatico (quello si chiude da solo col nuovo test).', p_id; end if;
end $$;

-- Email di allarme: solo se l'invio email è davvero acceso (Resend). In «hold» non si accoda nulla,
-- così all'accensione di Resend non parte una raffica di allarmi vecchi.
create or replace function ops._email_alert(p_id bigint, p_kind text) returns void
language plpgsql security definer set search_path = ops, public as $$
declare i ops.incidents; v_to text;
begin
  if coalesce(public._cfg('MAIL_MODE'), '') <> 'live' or coalesce((ops._setting('alert_email'))::text, 'true') = 'false' then return; end if;
  select * into i from ops.incidents where id = p_id;
  v_to := coalesce(ops._setting('alert_email_to') #>> '{}', public._cfg('ADMIN_EMAIL'));
  if v_to is null then return; end if;
  perform public._enqueue_mail('ops_alert', 'it', v_to, jsonb_build_object(
    'kind', p_kind, 'severity', i.severity, 'title', i.title, 'area', i.area, 'impact', coalesce(i.impact, ''),
    'fix', coalesce(i.fix, ''), 'opened', to_char(i.opened_at at time zone 'Europe/Rome', 'DD/MM/YYYY HH24:MI'),
    'evidence', left(coalesce(i.evidence::text, ''), 900), 'id', i.id), null);
  if p_kind = 'open' then update ops.incidents set email_sent_at = now() where id = p_id; end if;
exception when others then
  raise warning 'Nikita: email di allarme non accodata: %', sqlerrm;   -- l'allarme resta per la notifica oraria
end $$;

-- ------------------------------------------------------------------ controlli HTTP
-- config: url, headers, expect_status (array), expect_text (array: tutti presenti), forbid_text (array),
--         expect_location (testo), max_ms (oltre = parziale), fail_ms (oltre = guasto), json_empty_if_200
create or replace function ops.http_check(c ops.checks) returns jsonb
language plpgsql set search_path = ops, extensions, public as $$
declare cfg jsonb := c.config; r jsonb; v_status int; v_exp int[]; t text; v_body text; v_ms int; v_problems text[] := '{}';
begin
  r := ops._http(cfg->>'url', coalesce(cfg->'headers', '{}'::jsonb), coalesce(cfg->>'method', 'GET'));
  v_ms := (r->>'ms')::int;
  if not (r->>'ok')::boolean then
    return ops._res('fail', 'non raggiungibile: ' || (r->>'error'), jsonb_build_object('url', cfg->>'url', 'ms', v_ms));
  end if;
  v_status := (r->>'status')::int; v_body := coalesce(r->>'body', '');
  select coalesce(array_agg(x::int), array[200]) into v_exp from jsonb_array_elements_text(cfg->'expect_status') x;
  if not v_status = any(v_exp) then v_problems := v_problems || ('risponde ' || v_status || ' invece di ' || array_to_string(v_exp, '/')); end if;
  for t in select jsonb_array_elements_text(coalesce(cfg->'expect_text', '[]'::jsonb)) loop
    if position(t in v_body) = 0 then v_problems := v_problems || ('manca «' || left(t, 60) || '»'); end if;
  end loop;
  for t in select jsonb_array_elements_text(coalesce(cfg->'forbid_text', '[]'::jsonb)) loop
    if position(t in v_body) > 0 then v_problems := v_problems || ('contiene «' || left(t, 60) || '»'); end if;
  end loop;
  if cfg ? 'expect_location' and position(cfg->>'expect_location' in coalesce(r->>'location', '')) = 0 then
    v_problems := v_problems || ('reindirizza a «' || coalesce(r->>'location', 'nessuna destinazione') || '» invece di «' || (cfg->>'expect_location') || '»');
  end if;
  if coalesce((cfg->>'json_empty_if_200')::boolean, false) and v_status = 200 and btrim(v_body) not in ('[]', '') then
    v_problems := v_problems || ('restituisce dati: ' || left(v_body, 120));
  end if;
  if array_length(v_problems, 1) > 0 then
    return ops._res('fail', array_to_string(v_problems, '; '), jsonb_build_object('url', cfg->>'url', 'http', v_status, 'ms', v_ms));
  end if;
  if cfg ? 'fail_ms' and v_ms > (cfg->>'fail_ms')::int then
    return ops._res('fail', 'risposta in ' || v_ms || ' ms (limite ' || (cfg->>'fail_ms') || ')', jsonb_build_object('url', cfg->>'url', 'http', v_status, 'ms', v_ms));
  end if;
  if cfg ? 'max_ms' and v_ms > (cfg->>'max_ms')::int then
    return ops._res('partial', 'lenta: ' || v_ms || ' ms (obiettivo ' || (cfg->>'max_ms') || ')', jsonb_build_object('url', cfg->>'url', 'http', v_status, 'ms', v_ms));
  end if;
  return ops._res('pass', 'HTTP ' || v_status || ' in ' || v_ms || ' ms', jsonb_build_object('url', cfg->>'url', 'http', v_status, 'ms', v_ms));
end $$;

-- ------------------------------------------------------------------ controlli SQL e composti
create or replace function ops.chk_rls() returns jsonb language plpgsql stable set search_path = ops, public as $$
declare v jsonb; n int;
begin
  select coalesce(jsonb_agg(c.relname order by c.relname), '[]'::jsonb) into v
    from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity;
  select count(*) into n from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and c.relkind in ('r','p');
  if jsonb_array_length(v) > 0 then
    return ops._res('fail', 'tabelle senza RLS, leggibili o modificabili con la chiave pubblica: ' || (select string_agg(x, ', ') from jsonb_array_elements_text(v) x), jsonb_build_object('tabelle', v));
  end if;
  return ops._res('pass', 'RLS attiva su tutte le ' || n || ' tabelle');
end $$;

-- Nuove funzioni eseguibili da chiunque senza chiave: confronto con l'elenco verificato al 4 novembre 2026.
create or replace function ops.chk_funzioni_pubbliche() returns jsonb language plpgsql stable set search_path = ops, public as $$
declare cur jsonb; base jsonb := coalesce(ops._setting('public_functions_baseline'), '[]'::jsonb); nuove jsonb;
begin
  select coalesce(jsonb_agg(sig order by sig), '[]'::jsonb) into cur from (
    select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' sig
      from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')
       and pg_get_function_identity_arguments(p.oid) not like '%p_token%') x;
  select coalesce(jsonb_agg(x), '[]'::jsonb) into nuove from jsonb_array_elements(cur) x where not base @> jsonb_build_array(x);
  if jsonb_array_length(nuove) > 0 then
    return ops._res('fail', jsonb_array_length(nuove) || ' funzioni nuove eseguibili da chiunque senza chiave, da verificare: '
      || (select string_agg(x, ', ') from jsonb_array_elements_text(nuove) x), jsonb_build_object('nuove', nuove));
  end if;
  return ops._res('pass', jsonb_array_length(cur) || ' funzioni pubbliche senza chiave, tutte già verificate');
end $$;

-- Le tabelle riservate interrogate dall'esterno con la chiave pubblica del sito non devono restituire righe.
create or replace function ops.chk_rest_anon() returns jsonb language plpgsql set search_path = ops, public as $$
declare t text; r jsonb; base text := ops._setting('supabase_url') #>> '{}'; k text := ops._setting('anon_key') #>> '{}';
        leaks text[] := '{}'; errs text[] := '{}'; n int := 0;
begin
  for t in select jsonb_array_elements_text(ops._setting('sensitive_tables')) loop
    r := ops._http(base || '/rest/v1/' || t || '?select=*&limit=1', jsonb_build_object('apikey', k));
    n := n + 1;
    if not (r->>'ok')::boolean then errs := errs || (t || ': ' || (r->>'error'));
    elsif (r->>'status')::int = 200 and btrim(coalesce(r->>'body', '')) not in ('[]', '') then leaks := leaks || t;
    elsif (r->>'status')::int not in (200, 401, 403, 404) then errs := errs || (t || ': HTTP ' || (r->>'status'));
    end if;
  end loop;
  if array_length(leaks, 1) > 0 then
    return ops._res('fail', 'DATI RISERVATI LEGGIBILI DALL''ESTERNO: ' || array_to_string(leaks, ', '), jsonb_build_object('tabelle', leaks));
  end if;
  if array_length(errs, 1) = n then return ops._res('not_tested', 'API non raggiungibile: ' || array_to_string(errs, '; ')); end if;
  return ops._res('pass', n || ' tabelle riservate provate dall''esterno: nessuna restituisce dati'
    || case when array_length(errs, 1) > 0 then ' (non provate: ' || array_to_string(errs, '; ') || ')' else '' end);
end $$;

create or replace function ops.chk_email_coda() returns jsonb language plpgsql stable set search_path = ops, public as $$
declare v_mode text := coalesce(public._cfg('MAIL_MODE'), 'hold'); v_stuck int; v_failed int; v_held int; v_blocked int;
begin
  select count(*) filter (where status in ('queued','sending') and created_at < now() - interval '30 minutes'),
         count(*) filter (where status = 'failed' and created_at > now() - interval '7 days'),
         count(*) filter (where status = 'held'), count(*) filter (where status = 'blocked')
    into v_stuck, v_failed, v_held, v_blocked from public.outbox;
  if v_stuck > 0 then
    return ops._res('fail', v_stuck || ' email ferme in coda da oltre 30 minuti: il mailer non le prende in carico', jsonb_build_object('ferme', v_stuck));
  end if;
  if v_mode <> 'live' then
    return ops._res('not_tested', 'invio email spento (MAIL_MODE=' || v_mode || '): Resend non ancora attivo; trattenute ' || v_held || ', bloccate ' || v_blocked,
      jsonb_build_object('trattenute', v_held, 'bloccate', v_blocked));
  end if;
  if v_failed > 0 then
    return ops._res('fail', v_failed || ' email fallite negli ultimi 7 giorni', jsonb_build_object('fallite', v_failed));
  end if;
  return ops._res('pass', 'coda email regolare');
end $$;

create or replace function ops.chk_stripe() returns jsonb language plpgsql stable set search_path = ops, public as $$
declare v_mode text := coalesce(public._cfg('BILLING_MODE'), 'off'); v_bad int; v_overdue int; v_events int;
begin
  select count(*) filter (where received_at > now() - interval '24 hours' and (result like 'duplicate:%' or result = 'mismatch' or result like 'error%')),
         count(*) into v_bad, v_events from public.billing_events;
  select count(*) into v_overdue from public.subscriptions where status = 'active' and current_period_end < now() - interval '2 days';
  if v_bad > 0 or v_overdue > 0 then
    return ops._res('fail', concat_ws('; ', case when v_bad > 0 then v_bad || ' eventi Stripe anomali nelle ultime 24 ore (doppioni o pagamenti non corrispondenti)' end,
                                      case when v_overdue > 0 then v_overdue || ' abbonamenti attivi con il periodo scaduto da oltre 2 giorni: rinnovo non registrato' end),
                    jsonb_build_object('eventi_anomali', v_bad, 'rinnovi_mancanti', v_overdue));
  end if;
  if v_mode = 'off' and v_events = 0 then
    return ops._res('not_tested', 'pagamenti spenti (BILLING_MODE=off) e nessun evento Stripe ricevuto finora');
  end if;
  return ops._res('pass', 'pagamenti in modalità ' || v_mode || ', nessuna anomalia; eventi ricevuti: ' || v_events);
end $$;

create or replace function ops.chk_palinsesto() returns jsonb language plpgsql stable set search_path = ops, public as $$
declare h timestamptz; d numeric;
begin
  select max(starts_at) into h from public.nights;
  if h is null then return ops._res('fail', 'nessuna serata in calendario'); end if;
  d := round(extract(epoch from h - now()) / 86400);
  if d < 7 then return ops._res('fail', 'il palinsesto finisce il ' || to_char(h at time zone 'Europe/Rome', 'DD/MM') || ' (tra ' || d || ' giorni)', jsonb_build_object('giorni', d)); end if;
  if d < 21 then return ops._res('partial', 'il palinsesto finisce il ' || to_char(h at time zone 'Europe/Rome', 'DD/MM') || ' (tra ' || d || ' giorni): va esteso', jsonb_build_object('giorni', d)); end if;
  return ops._res('pass', 'palinsesto fino al ' || to_char(h at time zone 'Europe/Rome', 'DD/MM/YYYY') || ' (' || d || ' giorni)', jsonb_build_object('giorni', d));
end $$;

-- «Il rosso della diretta si accende solo se c'è davvero qualcosa in onda»: una diretta in onda da troppo tempo è un fantasma.
create or replace function ops.chk_dirette_fantasma() returns jsonb language plpgsql stable set search_path = ops, public as $$
declare demo jsonb := coalesce(ops._setting('demo_sellers'), '[]'::jsonb); v_real jsonb; v_demo jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('diretta', j.slug || '/' || s.slug, 'in_onda_da', to_char(coalesce(s.started_at, s.scheduled_at) at time zone 'Europe/Rome', 'DD/MM HH24:MI')))
                  filter (where not demo ? j.slug), '[]'::jsonb),
         coalesce(jsonb_agg(jsonb_build_object('diretta', j.slug || '/' || s.slug, 'in_onda_da', to_char(coalesce(s.started_at, s.scheduled_at) at time zone 'Europe/Rome', 'DD/MM HH24:MI')))
                  filter (where demo ? j.slug), '[]'::jsonb)
    into v_real, v_demo
    from public.shows s join public.jewelers j on j.id = s.jeweler_id
   where s.status = 'live' and coalesce(s.started_at, s.scheduled_at) < now() - make_interval(mins => coalesce(s.duration_min, 60) + 90);
  if jsonb_array_length(v_real) > 0 then
    return ops._res('fail', jsonb_array_length(v_real) || ' dirette risultano in onda da ore: la vetrina mostra LIVE ADESSO e gli spettatori trovano lo schermo nero', jsonb_build_object('dirette', v_real));
  end if;
  if jsonb_array_length(v_demo) > 0 then
    return ops._res('partial', 'dirette dimostrative in onda da ore (' || (select string_agg(x->>'diretta' || ' dal ' || (x->>'in_onda_da'), ', ') from jsonb_array_elements(v_demo) x) || '): la vetrina mostra LIVE ADESSO', jsonb_build_object('dirette', v_demo));
  end if;
  return ops._res('pass', 'nessuna diretta fantasma');
end $$;

-- Prima di ogni diretta vera (prossimi 90 minuti): pezzi dichiarati, pagina pubblica, token video da spettatore.
create or replace function ops.chk_dirette_vicine() returns jsonb language plpgsql set search_path = ops, public as $$
declare demo jsonb := coalesce(ops._setting('demo_sellers'), '[]'::jsonb); base text := ops._setting('supabase_url') #>> '{}';
        s record; r jsonb; p jsonb; problems text[] := '{}'; n int := 0;
begin
  for s in select sh.id, sh.slug, j.slug seller, sh.scheduled_at, sh.status,
                  (select count(*) from public.pieces x where x.show_id = sh.id) pezzi,
                  (select count(*) from public.pieces x where x.show_id = sh.id and not exists (select 1 from public.piece_declarations d where d.piece_id = x.id)) senza_dich
             from public.shows sh join public.jewelers j on j.id = sh.jeweler_id
            where not demo ? j.slug and sh.status <> 'ended'
              and (sh.status = 'live' or sh.scheduled_at between now() and now() + interval '90 minutes')
  loop
    n := n + 1;
    if s.pezzi = 0 then problems := problems || (s.seller || ': nessun pezzo caricato'); end if;
    if s.senza_dich > 0 then problems := problems || (s.seller || ': ' || s.senza_dich || ' pezzi senza dichiarazione (non possono andare in onda)'); end if;
    r := ops._http(base || '/functions/v1/live/' || s.seller || '/token?show=' || s.id || '&name=Nikita');
    p := ops._jwt_payload(ops._json(r->>'body')->>'token');
    if (r->>'status')::int <> 200 or p is null then problems := problems || (s.seller || ': token video non rilasciato (HTTP ' || (r->>'status') || ')');
    elsif (p->'video'->>'canPublish')::boolean then problems := problems || (s.seller || ': lo spettatore riceve il permesso di trasmettere');
    end if;
    r := ops._http('https://uniqaia.com/' || s.seller || '/' || s.slug || '/');
    if (r->>'status')::int <> 200 then problems := problems || (s.seller || ': pagina pubblica della diretta HTTP ' || (r->>'status')); end if;
  end loop;
  if n = 0 then return ops._res('pass', 'nessuna diretta reale nei prossimi 90 minuti', jsonb_build_object('idle', true)); end if;
  if array_length(problems, 1) > 0 then return ops._res('fail', array_to_string(problems, '; '), jsonb_build_object('dirette', n)); end if;
  return ops._res('pass', n || ' dirette in arrivo pronte: pezzi dichiarati, pagina online, video raggiungibile');
end $$;

create or replace function ops.chk_cron() returns jsonb language plpgsql stable set search_path = ops, public, cron as $$
declare v jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('job', j.jobname, 'quando', to_char(d.start_time at time zone 'Europe/Rome', 'DD/MM HH24:MI'), 'errore', left(d.return_message, 200))), '[]'::jsonb)
    into v from cron.job_run_details d join cron.job j on j.jobid = d.jobid
   where d.status = 'failed' and d.start_time > now() - interval '2 hours';
  if jsonb_array_length(v) > 0 then return ops._res('fail', jsonb_array_length(v) || ' esecuzioni pianificate fallite nelle ultime 2 ore', jsonb_build_object('errori', v)); end if;
  return ops._res('pass', 'esecuzioni pianificate regolari');
end $$;

create or replace function ops.chk_ruota() returns jsonb language plpgsql stable set search_path = ops, public as $$
declare c record; v_bad int;
begin
  select * into c from public.wheel_config where id = 1;
  if c is null then return ops._res('fail', 'configurazione della ruota mancante'); end if;
  if c.mode = 'public' then
    select count(*) into v_bad from public.wheel_prizes where active and (not deliverable or coalesce(weight, 0) <= 0);
    if c.legal_ref is null or v_bad > 0 then
      return ops._res('fail', 'ruota pubblica senza ' || concat_ws(' e ', case when c.legal_ref is null then 'riferimento della verifica legale' end,
                                                                    case when v_bad > 0 then v_bad || ' premi visibili non erogabili o con probabilità 0' end));
    end if;
  end if;
  return ops._res('pass', 'ruota in modalità ' || c.mode || ', configurazione coerente', jsonb_build_object('modalita', c.mode));
end $$;

create or replace function ops.chk_costi_db() returns jsonb language plpgsql stable set search_path = ops, public as $$
declare v_size bigint := pg_database_size(current_database()); v_top jsonb; mb numeric;
begin
  select jsonb_agg(jsonb_build_object('tabella', relname, 'mb', round(pg_total_relation_size(c.oid) / 1048576.0, 1)) order by pg_total_relation_size(c.oid) desc)
    into v_top from (select c.oid, c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
                      where s.nspname = 'public' and c.relkind = 'r' order by pg_total_relation_size(c.oid) desc limit 4) c;
  mb := round(v_size / 1048576.0, 1);
  if mb > 400 then return ops._res('fail', 'database a ' || mb || ' MB: vicino al limite di 500 MB del piano gratuito', jsonb_build_object('mb', mb, 'tabelle', v_top)); end if;
  if mb > 250 then return ops._res('partial', 'database a ' || mb || ' MB su 500 del piano gratuito', jsonb_build_object('mb', mb, 'tabelle', v_top)); end if;
  return ops._res('pass', 'database a ' || mb || ' MB su 500 del piano gratuito', jsonb_build_object('mb', mb, 'tabelle', v_top));
end $$;

-- La vetrina pubblicata contiene le dirette in programma? (La rigenerazione automatica è affidata a GitHub.)
create or replace function ops.chk_vetrina_aggiornata() returns jsonb language plpgsql set search_path = ops, public as $$
declare r jsonb; v_body text; v_missing jsonb; n int;
begin
  r := ops._http('https://uniqaia.com/?nikita=' || extract(epoch from now())::bigint);
  if (r->>'status')::int <> 200 then return ops._res('not_tested', 'vetrina non leggibile (HTTP ' || (r->>'status') || ')'); end if;
  v_body := r->>'body';
  select count(*), coalesce(jsonb_agg(j.slug || '/' || s.slug) filter (where position(s.slug in v_body) = 0 and position(s.id::text in v_body) = 0), '[]'::jsonb)
    into n, v_missing
    from public.shows s join public.jewelers j on j.id = s.jeweler_id
   where j.is_public and s.visibility = 'public' and s.status <> 'ended'
     and (s.status = 'live' or s.scheduled_at > now()) and s.created_at < now() - interval '45 minutes';
  if jsonb_array_length(v_missing) > 0 then
    return ops._res('fail', jsonb_array_length(v_missing) || ' dirette programmate da oltre 45 minuti non compaiono in vetrina', jsonb_build_object('mancanti', v_missing));
  end if;
  return ops._res('pass', 'la vetrina mostra tutte le ' || n || ' dirette in programma');
end $$;

-- Rigenerazione delle pagine su GitHub: dovrebbe girare ogni 15 minuti.
create or replace function ops.chk_rigenerazione() returns jsonb language plpgsql set search_path = ops, public as $$
declare r jsonb; j jsonb; v_last timestamptz; v_runs int; v_age int; v_since text;
begin
  v_since := to_char((now() - interval '24 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  r := ops._http('https://api.github.com/repos/uglammy-cpu/gemologist-live/actions/workflows/uniqaia.yml/runs?per_page=100&created=%3E%3D' || v_since,
                 jsonb_build_object('Accept', 'application/vnd.github+json'));
  if (r->>'status')::int <> 200 then return ops._res('not_tested', 'API di GitHub non disponibile (HTTP ' || (r->>'status') || ')'); end if;
  j := (r->>'body')::jsonb;
  select count(*), max((x->>'updated_at')::timestamptz) filter (where x->>'conclusion' = 'success')
    into v_runs, v_last from jsonb_array_elements(j->'workflow_runs') x;
  v_age := round(extract(epoch from now() - v_last) / 60);
  if v_last is null or v_age > 60 then
    return ops._res('fail', 'ultima rigenerazione riuscita ' || coalesce(v_age || ' minuti fa', 'oltre 24 ore fa') || '; esecuzioni nelle ultime 24 ore: ' || v_runs || ' su 96 previste',
                    jsonb_build_object('minuti', v_age, 'esecuzioni_24h', v_runs));
  end if;
  return ops._res('pass', 'ultima rigenerazione ' || v_age || ' minuti fa; esecuzioni nelle ultime 24 ore: ' || v_runs, jsonb_build_object('minuti', v_age, 'esecuzioni_24h', v_runs));
end $$;

create or replace function ops.chk_domini() returns jsonb language plpgsql set search_path = ops, public as $$
declare d text; r jsonb; v_exp timestamptz; v_days int; out jsonb := '[]'::jsonb; worst text := 'pass'; msg text[] := '{}';
begin
  foreach d in array array['uniqaia.com', 'uniquaia.com'] loop
    r := ops._http('https://rdap.cloudflare.com/rdap/v1/domain/' || d);   -- registrar: Cloudflare (Verisign rifiuta la connessione da Supabase)
    if (r->>'status')::int <> 200 then msg := msg || (d || ': registro non leggibile'); if worst = 'pass' then worst := 'not_tested'; end if; continue; end if;
    select (x->>'eventDate')::timestamptz into v_exp from jsonb_array_elements(((r->>'body')::jsonb)->'events') x where x->>'eventAction' = 'expiration';
    v_days := round(extract(epoch from v_exp - now()) / 86400);
    out := out || jsonb_build_object('dominio', d, 'scade', to_char(v_exp, 'DD/MM/YYYY'), 'giorni', v_days);
    msg := msg || (d || ' scade il ' || to_char(v_exp, 'DD/MM/YYYY'));
    if v_days < 30 then worst := 'fail'; elsif v_days < 60 and worst <> 'fail' then worst := 'partial'; end if;
  end loop;
  return ops._res(worst, array_to_string(msg, '; '), jsonb_build_object('domini', out));
end $$;

create or replace function ops.chk_dns_email() returns jsonb language plpgsql set search_path = ops, public as $$
declare probs text[] := '{}'; warns text[] := '{}'; txt text;
begin
  txt := (select string_agg(x->>'data', ' ') from jsonb_array_elements(((ops._http('https://dns.google/resolve?name=uniqaia.com&type=MX')->>'body')::jsonb)->'Answer') x);
  if coalesce(txt, '') !~* 'google' then probs := probs || 'MX di Google Workspace mancante'::text; end if;
  txt := (select string_agg(x->>'data', ' ') from jsonb_array_elements(((ops._http('https://dns.google/resolve?name=uniqaia.com&type=TXT')->>'body')::jsonb)->'Answer') x);
  if coalesce(txt, '') !~ 'v=spf1' then probs := probs || 'SPF mancante'::text;
  elsif txt !~ '_spf.google.com' then probs := probs || 'SPF senza Google'::text; end if;
  txt := (select string_agg(x->>'data', ' ') from jsonb_array_elements(((ops._http('https://dns.google/resolve?name=_dmarc.uniqaia.com&type=TXT')->>'body')::jsonb)->'Answer') x);
  if coalesce(txt, '') !~ 'v=DMARC1' then warns := warns || 'DMARC mancante (le email possono finire nello spam)'::text; end if;
  txt := (select string_agg(x->>'data', ' ') from jsonb_array_elements(((ops._http('https://dns.google/resolve?name=google._domainkey.uniqaia.com&type=TXT')->>'body')::jsonb)->'Answer') x);
  if coalesce(txt, '') !~ 'v=DKIM1' then warns := warns || 'firma DKIM di Google non pubblicata'::text; end if;
  if coalesce(public._cfg('MAIL_MODE'), '') = 'live' then
    txt := (select string_agg(x->>'data', ' ') from jsonb_array_elements(((ops._http('https://dns.google/resolve?name=resend._domainkey.uniqaia.com&type=TXT')->>'body')::jsonb)->'Answer') x);
    if coalesce(txt, '') = '' then probs := probs || 'invio acceso ma firma DKIM di Resend non pubblicata'::text; end if;
  end if;
  if array_length(probs, 1) > 0 then return ops._res('fail', array_to_string(probs || warns, '; ')); end if;
  if array_length(warns, 1) > 0 then return ops._res('partial', array_to_string(warns, '; ')); end if;
  return ops._res('pass', 'MX, SPF, DKIM e DMARC di uniqaia.com presenti');
exception when others then
  return ops._res('not_tested', 'DNS non leggibile: ' || left(sqlerrm, 160));
end $$;

-- Token video da spettatore: rilasciato, stanza giusta, nessun permesso di trasmettere.
create or replace function ops.chk_livekit_token() returns jsonb language plpgsql set search_path = ops, public as $$
declare base text := ops._setting('supabase_url') #>> '{}'; s record; r jsonb; j jsonb; p jsonb;
begin
  select sh.id, j2.slug seller into s from public.shows sh join public.jewelers j2 on j2.id = sh.jeweler_id
   where sh.status <> 'ended' order by (sh.status = 'live') desc, sh.scheduled_at limit 1;
  if s.id is null then return ops._res('not_tested', 'nessuna diretta non conclusa su cui provare'); end if;
  r := ops._http(base || '/functions/v1/live/' || s.seller || '/token?show=' || s.id || '&name=Nikita');
  if not (r->>'ok')::boolean then return ops._res('not_tested', 'funzione live non raggiungibile: ' || (r->>'error')); end if;
  if (r->>'status')::int <> 200 then return ops._res('fail', 'token video non rilasciato: HTTP ' || (r->>'status') || ' ' || left(coalesce(r->>'body', r->>'error'), 120)); end if;
  j := ops._json(r->>'body'); p := ops._jwt_payload(j->>'token');
  if p is null then return ops._res('fail', 'token video illeggibile'); end if;
  if (p->'video'->>'canPublish')::boolean then return ops._res('fail', 'PERMESSI: lo spettatore riceve il permesso di trasmettere'); end if;
  if p->'video'->>'room' <> 'show-' || s.id then return ops._res('fail', 'il token apre la stanza sbagliata: ' || (p->'video'->>'room')); end if;
  if coalesce(j->>'url', '') not like 'wss://%' then return ops._res('fail', 'indirizzo LiveKit non valido: ' || coalesce(j->>'url', '—')); end if;
  return ops._res('pass', 'token da spettatore corretto (solo visione) per la stanza della diretta ' || s.seller, jsonb_build_object('ms', r->'ms'));
end $$;

-- Errore di autenticazione: una chiave del pannello falsa deve essere rifiutata.
create or replace function ops.chk_livekit_chiave_falsa() returns jsonb language plpgsql set search_path = ops, public as $$
declare base text := ops._setting('supabase_url') #>> '{}'; s record; r jsonb;
begin
  select sh.id, j2.slug seller into s from public.shows sh join public.jewelers j2 on j2.id = sh.jeweler_id order by sh.scheduled_at limit 1;
  if s.id is null then return ops._res('not_tested', 'nessuna diretta su cui provare'); end if;
  r := ops._http(base || '/functions/v1/live/' || s.seller || '/token?show=' || s.id || '&k=deadbeefdeadbeefdeadbeefdeadbeef');
  if (r->>'status')::int = 403 then return ops._res('pass', 'chiave falsa rifiutata (403)'); end if;
  if (r->>'status')::int = 200 then return ops._res('fail', 'SICUREZZA: una chiave falsa del pannello ottiene il token da trasmettitore'); end if;
  -- la funzione non risponde: è un problema di disponibilità (lo vede supabase.fn_live), non di sicurezza
  return ops._res('not_tested', 'funzione live non disponibile per la prova (HTTP ' || (r->>'status') || ')');
end $$;

-- Il collaudo con il browser (GitHub Actions) è arrivato di recente?
create or replace function ops.chk_collaudo_recente() returns jsonb language plpgsql stable set search_path = ops as $$
declare v_last timestamptz; h int;
begin
  select max(started_at) into v_last from ops.runs where source = 'e2e';
  if v_last is null then return ops._res('not_tested', 'nessun collaudo con il browser ancora ricevuto'); end if;
  h := round(extract(epoch from now() - v_last) / 3600);
  if h > 30 then return ops._res('fail', 'ultimo collaudo con il browser ' || h || ' ore fa: GitHub non lo ha eseguito', jsonb_build_object('ore', h)); end if;
  return ops._res('pass', 'ultimo collaudo ' || h || ' ore fa', jsonb_build_object('ore', h));
end $$;

-- ------------------------------------------------------------------ esecuzione
create or replace function ops.run(p_freq text) returns jsonb
language plpgsql security definer set search_path = ops, extensions, public as $$
declare v_run uuid; c ops.checks; r jsonb; n int := 0; counts jsonb := '{}'::jsonb; st text;
begin
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '15000');
  perform extensions.http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS', '8000');
  insert into ops.runs (source, freq) values ('sentinella', p_freq) returning id into v_run;
  for c in select * from ops.checks where enabled and freq = p_freq and kind in ('http','sql') order by id loop
    begin
      if c.kind = 'http' then r := ops.http_check(c);
      else execute format('select %s()', (c.config->>'fn')::regproc) into r;
      end if;
    exception when others then
      r := ops._res('error', 'errore interno del controllo: ' || left(sqlerrm, 200));
    end;
    st := coalesce(r->>'status', 'error');
    perform ops.record(c.id, st, coalesce((r->>'ms')::int, (r#>>'{detail,ms}')::int), r - 'status', v_run);
    counts := jsonb_set(counts, array[st], to_jsonb(coalesce((counts->>st)::int, 0) + 1));
    n := n + 1;
  end loop;
  update ops.runs set finished_at = now(), summary = counts || jsonb_build_object('checks', n) where id = v_run;
  return counts || jsonb_build_object('checks', n);
end $$;

-- Esiti del collaudo con il browser, consegnati dalla funzione «nikita» dopo la verifica della firma di GitHub.
create or replace function ops.ingest(p jsonb) returns jsonb
language plpgsql security definer set search_path = ops, public as $$
declare v_run uuid; x jsonb; n int := 0; v_id text; v_area text; v_sev text; v_st text;
begin
  if jsonb_typeof(p->'results') <> 'array' or jsonb_array_length(p->'results') > 400 then raise exception 'Esiti non validi.'; end if;
  insert into ops.runs (source, freq, meta, started_at)
  values ('e2e', 'e2e', coalesce(p->'run', '{}'::jsonb), coalesce((p#>>'{run,started_at}')::timestamptz, now())) returning id into v_run;
  for x in select * from jsonb_array_elements(p->'results') loop
    v_id := x->>'check';
    if v_id !~ '^e2e\.[a-z0-9_.-]{1,80}$' then raise exception 'Identificativo non valido: %', v_id; end if;
    v_area := coalesce(x->>'area', 'interfaccia');
    v_sev := coalesce(x->>'severity', 'P2');
    v_st := x->>'status';
    insert into ops.checks (id, area, title, kind, freq, severity, stale_after, config)
    values (v_id, v_area, left(coalesce(x->>'title', v_id), 200), 'e2e', 'e2e', v_sev, interval '30 hours', jsonb_build_object('impact', x->>'impact', 'fix', x->>'fix'))
    on conflict (id) do update set title = excluded.title, area = excluded.area, severity = excluded.severity,
      config = ops.checks.config || excluded.config
      where ops.checks.kind = 'e2e';
    perform ops.record(v_id, v_st, (x->>'ms')::int,
      jsonb_strip_nulls(jsonb_build_object('reason', left(x->>'reason', 600), 'project', x->>'project', 'evidence', x->'evidence', 'run_url', p#>>'{run,url}')), v_run);
    n := n + 1;
  end loop;
  update ops.runs set finished_at = now(), summary = jsonb_build_object('checks', n) where id = v_run;
  return jsonb_build_object('ricevuti', n, 'run', v_run, 'stato', ops.report()->'overall', 'problemi_aperti',
    (select count(*) from ops.incidents where status = 'open'));
end $$;

create or replace function public.nikita_ingest(p jsonb) returns jsonb
language sql security definer set search_path = ops, public as $$ select ops.ingest(p) $$;
revoke all on function public.nikita_ingest(jsonb) from public, anon, authenticated;
grant execute on function public.nikita_ingest(jsonb) to service_role;

-- ------------------------------------------------------------------ rapporto
-- Stato effettivo di un controllo: senza un esito recente vale NOT TESTED.
create or replace function ops._eff(c ops.checks) returns text language sql stable as $$
  select case when not c.enabled then 'disabled'
              when c.last_at is null or now() - c.last_at > c.stale_after or c.last_status in ('error','not_tested') then 'not_tested'
              else c.last_status end
$$;

create or replace function ops.report() returns jsonb language plpgsql stable set search_path = ops, public as $$
declare v_sent timestamptz; v_e2e timestamptz; v_overall text; areas jsonb; inc jsonb; res jsonb; nt jsonb; aut jsonb; core_nt int;
begin
  select max(finished_at) into v_sent from ops.runs where source = 'sentinella' and freq = '5m';
  select max(started_at) into v_e2e from ops.runs where source = 'e2e';

  select jsonb_agg(a order by a->>'area') into areas from (
    select jsonb_build_object('area', c.area,
      'stato', case when bool_or(ops._eff(c) = 'fail' and i.severity in ('P0','P1')) then 'RED'
                    when bool_or(ops._eff(c) in ('fail','partial')) then 'YELLOW'
                    when bool_and(ops._eff(c) in ('not_tested','disabled')) then 'NOT TESTED'
                    else 'GREEN' end,
      'superati', count(*) filter (where ops._eff(c) = 'pass'),
      'falliti', count(*) filter (where ops._eff(c) = 'fail'),
      'parziali', count(*) filter (where ops._eff(c) = 'partial'),
      'non_testati', count(*) filter (where ops._eff(c) = 'not_tested'),
      'controlli', jsonb_agg(jsonb_build_object('id', c.id, 'titolo', c.title, 'stato', ops._eff(c),
                     'quando', to_char(c.last_at at time zone 'Europe/Rome', 'DD/MM HH24:MI'), 'esito', c.last_detail->>'reason') order by c.id)) a
      from ops.checks c left join ops.incidents i on i.check_id = c.id and i.status = 'open'
     where c.enabled group by c.area) x;

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'gravita', severity, 'area', area, 'titolo', title, 'certezza', confidence,
           'aperto', to_char(opened_at at time zone 'Europe/Rome', 'DD/MM HH24:MI'), 'visto_ultima_volta', to_char(last_seen_at at time zone 'Europe/Rome', 'DD/MM HH24:MI'),
           'volte', occurrences, 'impatto', impact, 'correzione_proposta', fix, 'prova', evidence) order by ops._rank(severity), opened_at), '[]'::jsonb)
    into inc from ops.incidents where status = 'open';
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'gravita', severity, 'titolo', title, 'risolto', to_char(resolved_at at time zone 'Europe/Rome', 'DD/MM HH24:MI'), 'nota', resolved_note) order by resolved_at desc), '[]'::jsonb)
    into res from ops.incidents where status = 'resolved' and resolved_at > now() - interval '48 hours';
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'area', c.area, 'titolo', c.title, 'perche', coalesce(c.last_detail->>'reason', 'mai eseguito'))
           order by c.area, c.id), '[]'::jsonb)
    into nt from ops.checks c where c.enabled and ops._eff(c) = 'not_tested';
  select coalesce(jsonb_agg(jsonb_build_object('nome', a.name, 'funzione', a.purpose, 'evento', a.trigger, 'frequenza', a.frequency, 'sistema', a.system,
           'risultato_atteso', a.expected, 'responsabile', a.owner, 'attiva', a.active, 'nota', a.note,
           'ultima_esecuzione', to_char(c.last_at at time zone 'Europe/Rome', 'DD/MM HH24:MI'),
           'ultimo_successo', to_char(c.last_pass_at at time zone 'Europe/Rome', 'DD/MM HH24:MI'),
           'ultimo_errore', to_char(c.last_fail_at at time zone 'Europe/Rome', 'DD/MM HH24:MI'),
           'stato', case when c.id is null then 'non controllata' else ops._eff(c) end) order by a.id), '[]'::jsonb)
    into aut from ops.automations a left join ops.checks c on c.id = a.check_id;

  select count(*) into core_nt from ops.checks c where c.enabled and c.area in ('sito','livekit','supabase','sicurezza') and ops._eff(c) = 'not_tested';
  v_overall := case when v_sent is null or now() - v_sent > interval '15 minutes' then 'UNKNOWN'
                    when exists (select 1 from ops.incidents where status = 'open' and severity in ('P0','P1') and confidence = 'verificato') then 'RED'
                    when exists (select 1 from ops.incidents where status = 'open' and severity = 'P2') or core_nt > 0 then 'YELLOW'
                    else 'GREEN' end;

  return jsonb_build_object(
    'generato', to_char(now() at time zone 'Europe/Rome', 'DD/MM/YYYY HH24:MI'),
    'overall', v_overall,
    'sentinella_ultimo_giro', to_char(v_sent at time zone 'Europe/Rome', 'DD/MM HH24:MI'),
    'collaudo_ultimo', to_char(v_e2e at time zone 'Europe/Rome', 'DD/MM HH24:MI'),
    'aree', coalesce(areas, '[]'::jsonb), 'problemi_aperti', inc, 'risolti_48h', res, 'non_testati', nt, 'automazioni', aut,
    'allarmi_da_inviare', (select count(*) from ops.incidents where (status = 'open' and severity in ('P0','P1') and push_sent_at is null)
                                                          or (status = 'resolved' and push_sent_at is not null and resolved_push_sent_at is null)));
end $$;

-- ------------------------------------------------------------------ allarmi per l'appuntamento orario di Gilda
create or replace function ops.alerts_pending() returns jsonb language sql stable set search_path = ops as $$
  select jsonb_build_object(
    'sentinella_ferma', coalesce((select now() - max(finished_at) > interval '15 minutes' from ops.runs where source = 'sentinella' and freq = '5m'), true),
    'nuovi', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'gravita', severity, 'area', area, 'titolo', title, 'impatto', impact,
                 'correzione_proposta', fix, 'aperto', to_char(opened_at at time zone 'Europe/Rome', 'DD/MM HH24:MI'), 'prova', evidence) order by ops._rank(severity), opened_at)
               from ops.incidents where status = 'open' and severity in ('P0','P1') and push_sent_at is null), '[]'::jsonb),
    'risolti', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'gravita', severity, 'titolo', title, 'risolto', to_char(resolved_at at time zone 'Europe/Rome', 'DD/MM HH24:MI'), 'nota', resolved_note))
               from ops.incidents where status = 'resolved' and push_sent_at is not null and resolved_push_sent_at is null), '[]'::jsonb))
$$;

create or replace function ops.alerts_mark_sent(p_ids bigint[]) returns integer
language plpgsql security definer set search_path = ops as $$
declare n int;
begin
  update ops.incidents set
    push_sent_at = case when status = 'open' and push_sent_at is null then now() else push_sent_at end,
    resolved_push_sent_at = case when status = 'resolved' and push_sent_at is not null and resolved_push_sent_at is null then now() else resolved_push_sent_at end
  where id = any(p_ids);
  get diagnostics n = row_count; return n;
end $$;

create or replace function ops.prune() returns void language sql security definer set search_path = ops, cron as $$
  delete from ops.results where at < now() - interval '30 days';
  delete from ops.runs where started_at < now() - interval '30 days' and not exists (select 1 from ops.results r where r.run_id = runs.id);
  delete from cron.job_run_details where end_time < now() - interval '7 days';
$$;

revoke all on all functions in schema ops from public, anon, authenticated;

-- ------------------------------------------------------------------ impostazioni
insert into ops.settings (key, value, note) values
  ('supabase_url', '"https://itoxzepuukyvdxxtfetf.supabase.co"', 'progetto Supabase'),
  ('anon_key', '"sb_publishable_Y6m8EWUZt97nSTmYBsRwYg_Fnzidatk"', 'chiave pubblica del sito (sta nell''HTML di ogni pagina): serve a provare cosa vede un estraneo'),
  ('demo_sellers', '["rossi","ferri","lombardi","marchetti","pietrerare"]', 'venditori dimostrativi: i loro problemi valgono al massimo P2'),
  ('sensitive_tables', '["staff_tokens","applications","viewer_signups","requests","seller_private","seller_accounts","subscriptions","outbox","billing_events","payment_links","app_config","wheel_spins","wheel_events","wheel_audit","invites","follows","night_template"]', 'tabelle che dall''esterno non devono restituire righe'),
  ('alert_email', 'true', 'email di allarme P0/P1 tramite la coda outbox, solo con MAIL_MODE = live'),
  ('alert_email_to', 'null', 'vuoto = ADMIN_EMAIL di app_config')
on conflict (key) do nothing;

-- elenco delle funzioni eseguibili senza chiave verificate il 4 novembre 2026 (le nuove vanno guardate)
insert into ops.settings (key, value, note)
select 'public_functions_baseline', coalesce(jsonb_agg(sig order by sig), '[]'::jsonb), 'funzioni pubbliche senza p_token verificate il 4/11/2026'
  from (select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' sig
          from pg_proc p join pg_namespace s on s.oid = p.pronamespace
         where s.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')
           and pg_get_function_identity_arguments(p.oid) not like '%p_token%') x
on conflict (key) do nothing;

-- ------------------------------------------------------------------ catalogo dei controlli
insert into ops.checks (id, area, title, kind, freq, severity, fail_threshold, stale_after, config) values
 -- ogni 5 minuti: disponibilità
 ('sito.home', 'sito', 'Vetrina uniqaia.com', 'http', '5m', 'P0', 2, '20 minutes',
   '{"url":"https://uniqaia.com/","expect_text":["id=\"tabs\"","id=\"joinLink\""],"max_ms":3000,"fail_ms":15000,
     "impact":"Nessuno vede la piattaforma.","fix":"Controllare Cloudflare Pages (ultimo deploy) e il DNS di uniqaia.com."}'),
 ('sito.join', 'sito', 'Pagina per i gioiellieri /join', 'http', '5m', 'P1', 2, '20 minutes',
   '{"url":"https://uniqaia.com/join/","expect_text":["id=\"acct\"","uqw-"],"max_ms":3000,"fail_ms":15000,
     "impact":"I gioiellieri non possono registrarsi né candidarsi.","fix":"Controllare l''ultimo deploy e il template join.html."}'),
 ('sito.diretta', 'sito', 'Pagina pubblica di una diretta', 'http', '5m', 'P1', 2, '20 minutes',
   '{"url":"https://uniqaia.com/marchetti/orecchini-perle-e-diamanti-1de9/","expect_text":["Uniqaia"],"max_ms":3000,"fail_ms":15000,
     "impact":"Le pagine delle dirette non si aprono.","fix":"Controllare la rigenerazione delle pagine e l''ultimo deploy."}'),
 ('sito.pay', 'sito', 'Pagina di pagamento /pay', 'http', '5m', 'P1', 2, '20 minutes',
   '{"url":"https://uniqaia.com/pay/","expect_text":["id=\"box\""],"max_ms":3000,"fail_ms":15000,
     "impact":"I seller approvati non possono attivare l''abbonamento.","fix":"Controllare l''ultimo deploy (pay.html)."}'),
 ('sito.admin', 'sito', 'Pannello /admin', 'http', '5m', 'P2', 2, '20 minutes',
   '{"url":"https://uniqaia.com/admin/","expect_text":["Seller · Uniqaia"],"max_ms":3000,"fail_ms":15000}'),
 ('cloudflare.redirect_uniquaia', 'cloudflare', 'uniquaia.com rimanda a uniqaia.com conservando il percorso', 'http', '5m', 'P1', 2, '20 minutes',
   '{"url":"https://uniquaia.com/join/?nikita=1","expect_location":"https://uniqaia.com/join/?nikita=1",
     "impact":"I link già diffusi con il vecchio dominio non funzionano.","fix":"Regola di reindirizzamento su Cloudflare per uniquaia.com."}'),
 ('cloudflare.https', 'cloudflare', 'http:// passa a https://', 'http', '1h', 'P2', 2, '3 hours',
   '{"url":"http://uniqaia.com/","expect_location":"https://uniqaia.com/"}'),
 ('cloudflare.www', 'cloudflare', 'www.uniqaia.com risponde', 'http', '1h', 'P3', 2, '3 hours',
   '{"url":"https://www.uniqaia.com/","expect_text":["Uniqaia"]}'),
 ('sito.gemsandjewelry', 'sito', 'Copia su live.gemsandjewelrytechlab.com/show', 'http', '1h', 'P3', 2, '3 hours',
   '{"url":"https://live.gemsandjewelrytechlab.com/show/","expect_text":["Uniqaia"]}'),
 ('sito.404', 'sito', 'Pagina inesistente = 404 corretta', 'http', '1h', 'P3', 2, '3 hours',
   '{"url":"https://uniqaia.com/nikita-pagina-inesistente/","expect_status":[404],"expect_text":["Pagina non trovata"]}'),
 ('sito.robots', 'sito', 'robots.txt e sitemap', 'http', '1h', 'P3', 2, '3 hours',
   '{"url":"https://uniqaia.com/robots.txt","expect_text":["User-agent"]}'),
 ('supabase.api', 'supabase', 'Database raggiungibile dall''API pubblica', 'http', '5m', 'P0', 2, '20 minutes',
   '{"url":"https://itoxzepuukyvdxxtfetf.supabase.co/rest/v1/categories?select=slug&limit=1","headers":{"apikey":"sb_publishable_Y6m8EWUZt97nSTmYBsRwYg_Fnzidatk"},"expect_text":["slug"],"max_ms":2000,"fail_ms":10000,
     "impact":"Vetrina, dirette e pannelli restano senza dati.","fix":"Controllare lo stato del progetto su supabase.com (pausa, limiti, incidenti)."}'),
 ('supabase.auth', 'supabase', 'Servizio account (Supabase Auth)', 'http', '5m', 'P1', 2, '20 minutes',
   '{"url":"https://itoxzepuukyvdxxtfetf.supabase.co/auth/v1/health","headers":{"apikey":"sb_publishable_Y6m8EWUZt97nSTmYBsRwYg_Fnzidatk"},"expect_status":[200],
     "impact":"I seller non possono registrarsi né accedere.","fix":"Controllare Supabase Auth."}'),
 ('supabase.fn_live', 'supabase', 'Funzione video «live» risponde', 'http', '5m', 'P0', 2, '20 minutes',
   '{"url":"https://itoxzepuukyvdxxtfetf.supabase.co/functions/v1/live/rossi/token?show=00000000-0000-0000-0000-000000000000","expect_status":[404],"expect_text":["diretta non trovata"],
     "impact":"Nessuno può entrare nelle dirette.","fix":"Controllare la funzione live su Supabase (log e versione)."}'),
 ('supabase.fn_billing', 'supabase', 'Funzione pagamenti «billing» risponde', 'http', '5m', 'P1', 2, '20 minutes',
   '{"url":"https://itoxzepuukyvdxxtfetf.supabase.co/functions/v1/billing","expect_status":[405],
     "impact":"Pagamenti e webhook Stripe non funzionano.","fix":"Controllare la funzione billing su Supabase."}'),
 ('supabase.fn_mailer', 'supabase', 'Funzione email «mailer» risponde', 'http', '5m', 'P1', 2, '20 minutes',
   '{"url":"https://itoxzepuukyvdxxtfetf.supabase.co/functions/v1/mailer","expect_status":[403],"expect_text":["forbidden"],
     "impact":"Le email restano in coda.","fix":"Controllare la funzione mailer su Supabase."}'),
 ('supabase.fn_seller_files', 'supabase', 'Funzione file dei seller risponde', 'http', '5m', 'P2', 2, '20 minutes',
   '{"url":"https://itoxzepuukyvdxxtfetf.supabase.co/functions/v1/seller-files","expect_status":[405]}'),
 ('livekit.server', 'livekit', 'Server video LiveKit raggiungibile', 'http', '5m', 'P0', 2, '20 minutes',
   '{"url":"https://dirette-gioiellerie-jzz3ybpy.livekit.cloud/","expect_text":["OK"],"max_ms":2000,
     "impact":"Le dirette non partono.","fix":"Controllare status.livekit.io e la console di LiveKit Cloud."}'),
 ('dirette.vicine', 'livekit', 'Diretta vera nei prossimi 90 minuti: pronta', 'sql', '5m', 'P1', 1, '20 minutes',
   '{"fn":"ops.chk_dirette_vicine","impact":"La diretta rischia di non partire o di non poter mostrare i pezzi.","fix":"Completare le dichiarazioni dei pezzi dal pannello e verificare il video."}'),
 -- ogni ora
 ('livekit.token_spettatore', 'livekit', 'Token video da spettatore: solo visione, stanza giusta', 'sql', '1h', 'P1', 1, '3 hours',
   '{"fn":"ops.chk_livekit_token","impact":"Gli spettatori non entrano, oppure possono trasmettere.","fix":"Controllare la funzione live (tokenRoute)."}'),
 ('sicurezza.chiave_falsa', 'sicurezza', 'Chiave falsa del pannello rifiutata', 'sql', '1h', 'P0', 1, '3 hours',
   '{"fn":"ops.chk_livekit_chiave_falsa","impact":"Chiunque potrebbe trasmettere in una diretta.","fix":"Controllare staff_check e la funzione live."}'),
 ('sicurezza.rls', 'sicurezza', 'RLS attiva su tutte le tabelle', 'sql', '1h', 'P1', 1, '3 hours',
   '{"fn":"ops.chk_rls","impact":"Una tabella senza RLS si legge o si modifica con la chiave pubblica del sito.","fix":"alter table … enable row level security, lasciando l''accesso alle sole funzioni."}'),
 ('sicurezza.tabelle_riservate', 'sicurezza', 'Tabelle riservate illeggibili dall''esterno', 'sql', '1h', 'P0', 1, '3 hours',
   '{"fn":"ops.chk_rest_anon","impact":"Dati personali o chiavi esposti a chiunque.","fix":"Chiudere subito la tabella (RLS senza policy) e verificare cosa è stato letto nei log."}'),
 ('sicurezza.funzioni_pubbliche', 'sicurezza', 'Nessuna nuova funzione aperta a tutti senza chiave', 'sql', '1h', 'P1', 1, '3 hours',
   '{"fn":"ops.chk_funzioni_pubbliche","impact":"Una funzione nuova potrebbe permettere operazioni riservate senza chiave.","fix":"Verificare la funzione; se è sicura aggiungerla all''elenco verificato (ops.settings public_functions_baseline)."}'),
 ('email.coda', 'email', 'Coda email', 'sql', '1h', 'P1', 1, '3 hours',
   '{"fn":"ops.chk_email_coda","impact":"Candidati e seller non ricevono conferme, link o credenziali.","fix":"Controllare la funzione mailer, la chiave di Resend e il dominio verificato."}'),
 ('abbonamenti.stripe', 'abbonamenti', 'Eventi Stripe e rinnovi', 'sql', '1h', 'P1', 1, '3 hours',
   '{"fn":"ops.chk_stripe","impact":"Pagamenti o rinnovi registrati in modo errato.","fix":"Confrontare con la dashboard Stripe; correggere solo con l''OK di Elena."}'),
 ('automazioni.palinsesto', 'automazioni', 'Palinsesto generato per le prossime settimane', 'sql', '1h', 'P1', 1, '3 hours',
   '{"fn":"ops.chk_palinsesto","impact":"Senza serate in calendario i seller non possono candidarsi né programmare.","fix":"Eseguire generate_nights(6) (oggi si lancia a mano)."}'),
 ('automazioni.rigenerazione', 'automazioni', 'Rigenerazione delle pagine ogni 15 minuti (GitHub)', 'sql', '1h', 'P2', 1, '3 hours',
   '{"fn":"ops.chk_rigenerazione","impact":"Una diretta creata nel pannello compare in vetrina con ore di ritardo.","cause":"GitHub esegue i workflow pianificati in ritardo o li salta quando è carico: non garantisce i 15 minuti.","fix":"Far partire la rigenerazione quando cambiano i dati (per esempio da Supabase verso GitHub), non solo a orario."}'),
 ('sito.vetrina_aggiornata', 'sito', 'La vetrina mostra le dirette in programma', 'sql', '1h', 'P2', 1, '3 hours',
   '{"fn":"ops.chk_vetrina_aggiornata","impact":"Le dirette nuove non si vedono in vetrina.","fix":"Lanciare la rigenerazione (GitHub Actions → Uniqaia · rigenera le pagine)."}'),
 ('livekit.dirette_fantasma', 'livekit', 'Nessuna diretta fantasma (in onda da ore)', 'sql', '1h', 'P1', 1, '3 hours',
   '{"fn":"ops.chk_dirette_fantasma","impact":"La vetrina mostra LIVE ADESSO e chi entra trova lo schermo nero.","fix":"Chiudere la diretta dal pannello (stato «conclusa»); valutare la chiusura automatica dopo la durata prevista."}'),
 ('ruota.configurazione', 'ruota', 'Ruota: configurazione coerente', 'sql', '1h', 'P1', 1, '3 hours',
   '{"fn":"ops.chk_ruota","impact":"Premi non erogabili o senza verifica legale mostrati al pubblico.","fix":"Rimettere la ruota in demo dal pannello /wheel-admin/."}'),
 ('nikita.esecuzioni', 'nikita', 'Esecuzioni pianificate (pg_cron) senza errori', 'sql', '1h', 'P1', 1, '3 hours',
   '{"fn":"ops.chk_cron","impact":"Una parte dei controlli non sta girando.","fix":"Leggere cron.job_run_details e correggere la funzione."}'),
 ('nikita.collaudo_recente', 'nikita', 'Collaudo con il browser eseguito nelle ultime 30 ore', 'sql', '1h', 'P2', 1, '3 hours',
   '{"fn":"ops.chk_collaudo_recente","impact":"Pulsanti, moduli e pagine non vengono provati con un browser vero.","fix":"Lanciare a mano GitHub Actions → Nikita · collaudo."}'),
 ('costi.supabase', 'costi', 'Spazio del database Supabase', 'sql', '1h', 'P2', 1, '3 hours',
   '{"fn":"ops.chk_costi_db","impact":"Oltre 500 MB il piano gratuito va in sola lettura.","fix":"Spostare le immagini dal database a uno storage, oppure passare al piano Pro."}'),
 -- ogni giorno
 ('cloudflare.domini', 'cloudflare', 'Scadenza dei domini uniqaia.com e uniquaia.com', 'sql', '1d', 'P1', 1, '30 hours',
   '{"fn":"ops.chk_domini","impact":"Se un dominio scade, il sito o i vecchi link smettono di funzionare.","fix":"Rinnovare il dominio dal pannello Cloudflare (uniquaia.com ha il rinnovo automatico spento)."}'),
 ('email.dns', 'email', 'Record DNS della posta (MX, SPF, DKIM, DMARC)', 'sql', '1d', 'P2', 1, '30 hours',
   '{"fn":"ops.chk_dns_email","impact":"Le email di uniqaia.com finiscono nello spam o non arrivano.","fix":"Aggiungere i record mancanti nel DNS di Cloudflare."}')
on conflict (id) do update set title = excluded.title, area = excluded.area, kind = excluded.kind, freq = excluded.freq,
  severity = excluded.severity, fail_threshold = excluded.fail_threshold, stale_after = excluded.stale_after, config = excluded.config;

-- controlli che si fanno fuori dal database: li registra l'agente o il collaudo (finché non arrivano valgono NOT TESTED)
insert into ops.checks (id, area, title, kind, freq, severity, stale_after, config) values
 ('agenti.gilda', 'agenti', 'Gilda: promemoria del mattino eseguito', 'agent', 'agent', 'P2', '30 hours', '{}'),
 ('agenti.marketing', 'agenti', 'Marketing Manager: giro del lunedì eseguito', 'agent', 'agent', 'P2', '8 days', '{}'),
 ('agenti.allarmi', 'agenti', 'Gilda: controllo orario degli allarmi eseguito', 'agent', 'agent', 'P1', '30 hours', '{}'),
 ('agenti.nikita', 'agenti', 'Nikita: rapporto quotidiano eseguito', 'agent', 'agent', 'P2', '30 hours', '{}'),
 ('backup.supabase', 'backup', 'Backup del database', 'agent', 'agent', 'P2', '30 hours',
   '{"impact":"Se il database si rovina non c''è una copia da cui ripartire.","fix":"Piano Supabase Pro (backup giornalieri) e prova periodica di ripristino in ambiente isolato."}'),
 ('backup.sorgenti', 'backup', 'Codice di tutte le funzioni nel repository', 'agent', 'agent', 'P2', '8 days', '{}'),
 ('sicurezza.advisor', 'sicurezza', 'Avvisi di sicurezza Supabase: nessun nuovo ERROR', 'agent', 'agent', 'P1', '30 hours', '{}'),
 ('costi.servizi', 'costi', 'Consumi LiveKit, Cloudflare, Resend, traduzione', 'agent', 'agent', 'P2', '30 hours', '{}'),
 ('livekit.diretta_completa', 'livekit', 'Diretta di prova completa: trasmissione, audio/video, sottotitoli', 'agent', 'agent', 'P1', '8 days', '{}')
on conflict (id) do nothing;

-- ------------------------------------------------------------------ inventario delle automazioni
insert into ops.automations (id, name, purpose, trigger, frequency, system, expected, owner, check_id, active, note) values
 ('rigenerazione', 'Rigenerazione delle pagine', 'Scarica i dati da Supabase e ripubblica vetrina, schede e pagine delle dirette', 'pianificazione + modifica dei sorgenti', 'ogni 15 minuti (dichiarato)', 'GitHub Actions → Cloudflare Pages', 'una diretta creata nel pannello compare in vetrina entro 15 minuti', 'Claude (sviluppo)', 'automazioni.rigenerazione', true, 'GitHub non garantisce gli orari dei workflow pianificati'),
 ('coda_email', 'Coda email', 'Spedisce conferme di candidatura, richieste di integrazione, link di pagamento, attivazioni', 'nuova riga in outbox', 'a ogni evento', 'Supabase (pg_net) → funzione mailer → Resend', 'email consegnata, mai due volte', 'Claude (sviluppo)', 'email.coda', true, 'MAIL_MODE=hold finché Resend non è attivo'),
 ('candidatura_notifica', 'Nuova candidatura → avviso a Elena', 'Conferma al candidato e avviso alla gemmologa', 'account_submit_application', 'a ogni candidatura', 'Supabase → coda email', 'due email accodate', 'Elena', 'email.coda', true, null),
 ('webhook_stripe', 'Webhook Stripe', 'Attiva l''abbonamento, registra rinnovi e disdette', 'evento firmato da Stripe', 'a ogni evento', 'Stripe → funzione billing → database', 'abbonamento attivo solo dopo il pagamento confermato', 'Claude (sviluppo)', 'abbonamenti.stripe', true, 'BILLING_MODE=off finché Stripe non è configurato'),
 ('palinsesto', 'Generazione del palinsesto', 'Crea le serate a tema dallo schema settimanale', 'manuale (generate_nights)', 'a mano', 'Supabase', 'calendario sempre coperto per almeno 3 settimane', 'Elena / Claude', 'automazioni.palinsesto', true, 'non c''è estensione automatica'),
 ('sottotitoli', 'Agente dei sottotitoli', 'Trascrive l''italiano e traduce in en/fr/ru/ar', 'apertura di una stanza video', 'a ogni diretta', 'LiveKit Cloud (CA_rXsbNf5YU6hC)', 'sottotitoli entro circa un secondo', 'Claude (sviluppo)', 'livekit.diretta_completa', true, null),
 ('gilda', 'Gilda · promemoria del mattino', 'Ricorda a Elena cose da fare, OK da dare, controlli', 'pianificazione', 'ogni giorno 7:58', 'Claude (appuntamento automatico)', 'messaggio a Elena', 'Gilda', 'agenti.gilda', true, null),
 ('gilda_allarmi', 'Gilda · allarmi urgenti', 'Inoltra a Elena gli allarmi P0/P1 di Nikita', 'pianificazione', 'ogni ora 8–23', 'Claude (appuntamento automatico)', 'notifica sul telefono entro un''ora', 'Gilda', 'agenti.allarmi', true, null),
 ('marketing', 'Marketing Manager · iniziativa del lunedì', 'Propone l''iniziativa della settimana', 'pianificazione', 'lunedì 7:33', 'Claude (appuntamento automatico)', 'scheda nel registro e messaggio a Elena', 'Marketing Manager', 'agenti.marketing', true, null),
 ('nikita_sentinella', 'Nikita · sentinella', 'Controlli di disponibilità, sicurezza, dati e automazioni', 'pg_cron', 'ogni 5 minuti / ogni ora / ogni giorno', 'Supabase', 'esiti registrati, problemi aperti e chiusi da soli', 'Nikita', 'nikita.esecuzioni', true, null),
 ('nikita_collaudo', 'Nikita · collaudo con il browser', 'Pulsanti, moduli, link, lingue, ruota, video da spettatore', 'pianificazione + ogni aggiornamento del sito + a mano', 'ogni giorno', 'GitHub Actions (Playwright)', 'esiti consegnati alla funzione nikita', 'Nikita', 'nikita.collaudo_recente', true, null),
 ('nikita_rapporto', 'Nikita · rapporto quotidiano', 'Software Health Report per Gilda', 'pianificazione', 'ogni giorno 7:41', 'Claude (appuntamento automatico)', 'rapporto nel progetto', 'Nikita', 'agenti.nikita', true, null),
 ('social', 'Social Media Manager', 'Proposte di contenuti per Instagram e TikTok', '—', 'non ancora pianificato', 'Claude', '—', 'Marketing Manager', null, false, 'in attesa del brief di Elena')
on conflict (id) do update set name = excluded.name, purpose = excluded.purpose, trigger = excluded.trigger, frequency = excluded.frequency,
  system = excluded.system, expected = excluded.expected, owner = excluded.owner, check_id = excluded.check_id, active = excluded.active, note = excluded.note;

-- ------------------------------------------------------------------ pianificazione (pg_cron, orari UTC)
select cron.schedule('nikita-5m', '*/5 * * * *', $$select ops.run('5m')$$);
select cron.schedule('nikita-1h', '7 * * * *', $$select ops.run('1h')$$);
select cron.schedule('nikita-1d', '23 4 * * *', $$select ops.run('1d')$$);
select cron.schedule('nikita-pulizia', '41 3 * * *', $$select ops.prune()$$);
