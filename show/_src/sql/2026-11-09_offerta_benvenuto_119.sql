-- Uniqaia — Offerta di benvenuto uguale per tutti: primo mese a 119 € invece di 149 €
-- Decisione di Elena del 7/11/2026 (13:56 e 13:59), confermata il 9/11/2026: «La ruota la lasciamo in demo. Sconto per tutti a 119 euro per il primo mese.»
-- Preparata il 7/11 sul ramo offerta-benvenuto, mai applicata; riportata il 9/11 con LEG-012, punto 6: con l'offerta vale solo l'offerta, la ruota non conta.
--
-- Al posto della ruota (in demo dal 7/11 dopo LEG-004: con premi diversi a sorte è un concorso a premio):
-- il primo mese a un prezzo d'offerta (oggi 119 € invece di 149 €) per ogni brand approvato, senza sorte.
-- Vale per chi si candida mentre l'offerta è accesa, e anche per chi viene approvato mentre è accesa:
-- se Elena la spegne, chi si era già candidato non la perde. Una volta per azienda (un abbonamento per seller).
-- Si accende e si spegne da /admin (Elena). Lo sconto arriva a Stripe da solo, come quello della ruota
-- (billing_checkout_start manda la differenza fra prezzo standard e primo mese).
--
-- Migrazione aggiuntiva: una tabella, funzioni nuove e _billing_open con due righe in più.
-- Dove: Supabase, progetto itoxzepuukyvdxxtfetf → SQL Editor → New query → incolla tutto → Run.
begin;

-- copia di sicurezza della funzione che cambia
create schema if not exists backup;
create table if not exists backup.functions_20261109o as
  select p.proname, pg_get_functiondef(p.oid) as def, now() as saved_at
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_billing_open';

-- ---------- 1. le finestre dell'offerta: ogni accensione è una riga, lo spegnimento chiude la riga
create table if not exists public.welcome_windows (
  id bigserial primary key,
  first_cents int not null check (first_cents > 0),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
alter table public.welcome_windows enable row level security;
revoke all on public.welcome_windows from public, anon, authenticated;

insert into public.app_config (key, value) values ('WELCOME_PREVIEW_CENTS', '11900') on conflict (key) do nothing;

-- la finestra aperta adesso, se c'è
create or replace function public._welcome_open()
 returns public.welcome_windows language sql stable security definer set search_path to 'public' as $$
  select * from public.welcome_windows
   where starts_at <= now() and (ends_at is null or ends_at > now())
   order by starts_at desc limit 1;
$$;

-- il prezzo d'offerta che spetta a una candidatura: la candidatura è arrivata mentre l'offerta era accesa,
-- oppure l'offerta è accesa adesso (all'approvazione). Se le finestre sono più d'una vale il prezzo più basso.
create or replace function public._welcome_cents_for(p_app public.applications)
 returns int language sql stable security definer set search_path to 'public' as $$
  select min(w.first_cents) from public.welcome_windows w
   where (coalesce(p_app.submitted_at, p_app.created_at) >= w.starts_at
          and (w.ends_at is null or coalesce(p_app.submitted_at, p_app.created_at) < w.ends_at))
      or (w.starts_at <= now() and (w.ends_at is null or w.ends_at > now()));
$$;

-- pubblica: la legge la finestra del sito (home e /join) e il prezzo su /join
create or replace function public.welcome_offer()
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare w public.welcome_windows := public._welcome_open();
begin
  return jsonb_build_object(
    'active', w.id is not null,
    'first_cents', w.first_cents,
    'until', w.ends_at,
    'preview_cents', coalesce(nullif(public._cfg('WELCOME_PREVIEW_CENTS'), '')::int, 11900),
    'std_cents', public._plan('PLAN_PRICE_CENTS'),
    'lives', public._plan('PLAN_LIVES_PER_MONTH'),
    'max_min', public._plan('PLAN_LIVE_MAX_MIN'),
    'wheel_live', coalesce((select mode = 'live' from public.wheel_config where id = 1), false),
    'legal_ready', public._legal_ready());
end $$;

-- /admin: stato e storico
create or replace function public.welcome_admin_get(p_token text)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare w public.welcome_windows := public._welcome_open();
begin
  if not public.is_gemologist(p_token) then raise exception 'Token non valido'; end if;
  return jsonb_build_object(
    'active', w.id is not null, 'first_cents', w.first_cents, 'since', w.starts_at, 'until', w.ends_at,
    'std_cents', public._plan('PLAN_PRICE_CENTS'),
    'preview_cents', coalesce(nullif(public._cfg('WELCOME_PREVIEW_CENTS'), '')::int, 11900),
    'history', coalesce((select jsonb_agg(jsonb_build_object('first_cents', h.first_cents, 'from', h.starts_at, 'to', h.ends_at) order by h.starts_at desc)
                           from (select * from public.welcome_windows order by starts_at desc limit 10) h), '[]'::jsonb));
end $$;

-- /admin: accendere (con prezzo e, se si vuole, una data di fine) o spegnere
create or replace function public.welcome_admin_set(p_token text, p_on boolean, p_first_cents int default null, p_until timestamptz default null)
 returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_std int := public._plan('PLAN_PRICE_CENTS');
begin
  if not public.is_gemologist(p_token) then raise exception 'Token non valido'; end if;
  perform pg_advisory_xact_lock(hashtext('welcome_windows'));
  -- chiude la finestra aperta (spegnimento, o cambio di prezzo o di data)
  update public.welcome_windows set ends_at = now() where starts_at <= now() and (ends_at is null or ends_at > now());
  if p_on then
    if p_first_cents is null or p_first_cents < 100 or p_first_cents >= v_std then
      raise exception 'Il prezzo del primo mese deve essere fra 1 € e il prezzo standard';
    end if;
    if p_until is not null and p_until <= now() then raise exception 'La data di fine deve essere nel futuro'; end if;
    insert into public.welcome_windows (first_cents, starts_at, ends_at, created_by) values (p_first_cents, now(), p_until, 'Elena (/admin)');
  end if;
  return public.welcome_admin_get(p_token);
end $$;

revoke all on function public._welcome_open() from public, anon, authenticated;
revoke all on function public._welcome_cents_for(public.applications) from public, anon, authenticated;
revoke all on function public.welcome_offer() from public;
grant execute on function public.welcome_offer() to anon, authenticated;
revoke all on function public.welcome_admin_get(text) from public;
revoke all on function public.welcome_admin_set(text, boolean, int, timestamptz) from public;
grant execute on function public.welcome_admin_get(text), public.welcome_admin_set(text, boolean, int, timestamptz) to anon, authenticated;

-- ---------- 2. il primo mese all'approvazione: la funzione di oggi, con l'offerta di benvenuto
create or replace function public._billing_open(p_jeweler uuid, p_app uuid)
 returns void language plpgsql security definer set search_path to 'public', 'extensions' as $function$
declare a public.applications; s public.wheel_spins; sub public.subscriptions; v_std int := public._plan('PLAN_PRICE_CENTS');
        v_first int := public._plan('PLAN_PRICE_CENTS'); v_mail bigint; v_mode text := public._billing_mode();
        v_welcome int; v_is_welcome boolean := false;
begin
  select * into a from public.applications where id = p_app;
  -- solo un premio vero (ruota pubblica) e confermato riduce il primo mese; quelli demo no
  select * into s from public.wheel_spins where application_id = p_app and status = 'confirmed' and mode = 'live' and prize_kind = 'discount' order by confirmed_at limit 1;
  if s.id is null then
    select * into s from public.wheel_spins where application_id = p_app and status = 'confirmed' and mode = 'live' order by confirmed_at limit 1;
  end if;
  if s.id is not null and s.prize_kind = 'discount' then v_first := least(s.first_month_cents, v_std); end if;
  -- offerta di benvenuto uguale per tutti (9/11/2026, LEG-012 punto 6): se spetta, vale solo l'offerta e la ruota non conta
  v_welcome := public._welcome_cents_for(a);
  if v_welcome is not null and v_welcome < v_std then v_first := v_welcome; v_is_welcome := true; s := null; end if;
  insert into public.subscriptions (jeweler_id, application_id, user_id, email, lang, spin_id, prize_name, first_month_cents, standard_cents, pay_token)
  values (p_jeweler, p_app, a.user_id, lower(a.email), a.lang, s.id, case when v_is_welcome then null else s.prize_name end, v_first, v_std, encode(gen_random_bytes(24), 'hex'))
  on conflict (jeweler_id) do nothing
  returning * into sub;
  if sub.id is null then return; end if;  -- già avviato: nessuna seconda email
  -- «offer» accende la frase sull'offerta della ruota nell'email: con l'offerta di benvenuto l'email mostra solo i prezzi
  insert into public.outbox (template, lang, to_email, data, application_id, status)
  values ('approved_payment', a.lang, lower(a.email),
          jsonb_build_object('brand', a.name, 'contact', a.contact_name, 'first_cents', v_first, 'std_cents', v_std,
                             'lives', public._plan('PLAN_LIVES_PER_MONTH'), 'max_min', public._plan('PLAN_LIVE_MAX_MIN'),
                             'offer', (not v_is_welcome) and v_first < v_std, 'prize', case when v_is_welcome then null else s.prize_name end,
                             'pay_token', sub.pay_token),
          p_app, case when v_mode = 'live' then 'queued' else 'blocked' end)
  on conflict do nothing
  returning id into v_mail;
  update public.subscriptions set link_mail_id = v_mail where id = sub.id;
  if v_mode = 'live' then perform public._poke_mailer(); end if;
end $function$;

commit;

-- Controllo: offerta spenta (la accende Elena da /admin), funzioni interne chiuse (devono essere false).
select public.welcome_offer() ->> 'active' as offerta_accesa,
       has_function_privilege('anon', 'public._welcome_cents_for(public.applications)', 'execute') as interna_aperta,
       (select count(*) from backup.functions_20261109o) as copie_salvate;
