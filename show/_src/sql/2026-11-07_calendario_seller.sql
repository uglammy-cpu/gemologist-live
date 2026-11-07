-- Uniqaia — calendario delle dirette per i seller (richiesta di Elena del 7/11/2026, ore 11:07)
--
-- Dopo l'approvazione Elena collega il seller a una serata del palinsesto (una delle sei vetrine:
-- Independent Designers, Collections, Precious Objects, The Gem Room, Pearls & Corals, Specials: Paraiba).
-- Il seller prenota da solo, nel calendario del suo pannello, le dirette nei giorni della sua serata,
-- all'ora che vuole (orari liberi, decisione di Elena delle 11:20: brand da tutto il mondo):
--   - il giorno è quello della serata, nel fuso orario del seller; l'ora è libera, a quarti d'ora; 60 minuti;
--   - al massimo 4 dirette al mese (il mese dell'abbonamento, se c'è; altrimenti il mese della serata);
--   - al massimo una a settimana (la settimana della serata, da lunedì a domenica);
--   - dirette di brand diversi possono sovrapporsi;
--   - si prenota fino a 24 ore prima, si annulla fino a 48 ore prima.
-- Può aggiungere la gemmologa che presenta, 50 € l'ora. La gemmologa è prenotabile dalle 5 all'una di
-- notte, ora italiana (Elena, 11:23), se in quell'ora non è già in un'altra diretta e se Elena non l'ha
-- bloccata. Il pagamento sarà online alla prenotazione quando Stripe è attivo: fino ad allora la
-- prenotazione della gemmologa resta «da pagare».
--
-- Migrazione aggiuntiva: una colonna nuova, due tabelle nuove, funzioni nuove. Cambiano solo due funzioni
-- esistenti, create_show e update_show2, con un controllo in più per i seller collegati a una serata
-- (prima una copia di sicurezza nello schema backup). Nessun dato esistente cambia.
--
-- Dove: Supabase, progetto itoxzepuukyvdxxtfetf → SQL Editor → New query → incolla tutto → Run.
begin;

-- ---------- copia di sicurezza delle due funzioni che cambiano
create schema if not exists backup;
revoke all on schema backup from public, anon, authenticated;
create table if not exists backup.functions_20261107b as
  select p.proname::text as name, pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('create_show', 'update_show2');

-- ---------- la serata del seller (la sceglie Elena all'approvazione)
alter table public.jewelers add column if not exists night_theme text;

-- ---------- la gemmologa: prenotazioni e ore bloccate da Elena
create table if not exists public.gem_bookings (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null unique references public.shows(id) on delete cascade,
  jeweler_id uuid not null references public.jewelers(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  price_cents integer not null default 5000,
  status text not null default 'da_pagare' check (status in ('da_pagare', 'pagata', 'annullata')),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  -- la gemmologa non può essere in due dirette insieme: lo garantisce il database anche con due prenotazioni nello stesso istante
  constraint gem_bookings_no_overlap exclude using gist (tstzrange(starts_at, ends_at, '[)') with &&) where (status <> 'annullata')
);
alter table public.gem_bookings enable row level security;
revoke all on public.gem_bookings from anon, authenticated;

create table if not exists public.gem_blocks (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
alter table public.gem_blocks enable row level security;
revoke all on public.gem_blocks from anon, authenticated;

-- ---------- regole (in un posto solo)
create or replace function public._cal_rules()
 returns jsonb language sql immutable as $$
  select jsonb_build_object('per_month', 4, 'per_week', 1, 'gem_cents', 5000, 'book_min_hours', 24, 'cancel_min_hours', 48, 'weeks', 6,
                            'duration_min', 60, 'step_min', 15, 'gem_from', '05:00', 'gem_to', '01:00', 'gem_tz', 'Europe/Rome');
$$;

-- la gemmologa è libera per la diretta che comincia a p_at? (p_except: la diretta che si sta controllando, per non contarla due volte)
-- 1) nei suoi orari: dalle 5 all'una di notte, ora italiana (la diretta deve finire entro l'una);
-- 2) non è già in un'altra diretta che si sovrappone; 3) Elena non ha bloccato quelle ore.
create or replace function public._gem_free(p_at timestamptz, p_except uuid default null)
 returns boolean language sql stable security definer set search_path to 'public' as $$
  select ((p_at at time zone 'Europe/Rome')::time >= time '05:00' or (p_at at time zone 'Europe/Rome')::time = time '00:00')
     and not exists (select 1 from public.gem_bookings g where g.status <> 'annullata' and g.show_id is distinct from p_except
                      and g.starts_at < p_at + interval '1 hour' and g.ends_at > p_at)
     and not exists (select 1 from public.gem_blocks b where b.starts_at < p_at + interval '1 hour' and b.ends_at > p_at);
$$;

-- il giorno della serata a cui appartiene una diretta (per contare settimane e mesi)
create or replace function public._show_day(p_show public.shows)
 returns date language sql stable security definer set search_path to 'public' as $$
  select coalesce((select (n.starts_at at time zone 'Europe/Rome')::date from public.nights n where n.id = p_show.night_id),
                  (p_show.scheduled_at at time zone 'Europe/Rome')::date);
$$;

-- ---------- il calendario del seller: le serate della sua vetrina nelle prossime sei settimane
create or replace function public.seller_calendar(p_token text, p_jeweler uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_role text; j public.jewelers; v_out jsonb;
begin
  select role into v_role from public.staff_jeweler(p_token, p_jeweler);
  if v_role is null then raise exception 'Token non valido'; end if;
  select * into j from public.jewelers where id = p_jeweler;
  if j.id is null then raise exception 'Venditore non trovato'; end if;
  select jsonb_build_object(
    'theme', j.night_theme,
    'role', v_role,
    'rules', public._cal_rules(),
    'subscription', (select jsonb_build_object('status', s.status, 'activated_at', s.activated_at) from public.subscriptions s where s.jeweler_id = j.id),
    'nights', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', n.id, 'title', n.title, 'day', (n.starts_at at time zone 'Europe/Rome')::date,
               -- quando la gemmologa è già impegnata, intorno a quel giorno (senza dire con chi): serve a scegliere l'ora
               'gem_busy', coalesce((select jsonb_agg(x order by x->>'from') from (
                   select jsonb_build_object('from', g.starts_at, 'to', g.ends_at, 'mine', g.jeweler_id = j.id) x from public.gem_bookings g
                    where g.status <> 'annullata' and g.ends_at > ((n.starts_at at time zone 'Europe/Rome')::date - 1)::timestamp at time zone 'Europe/Rome'
                      and g.starts_at < ((n.starts_at at time zone 'Europe/Rome')::date + 2)::timestamp at time zone 'Europe/Rome'
                   union all
                   select jsonb_build_object('from', b.starts_at, 'to', b.ends_at, 'mine', false) from public.gem_blocks b
                    where b.ends_at > ((n.starts_at at time zone 'Europe/Rome')::date - 1)::timestamp at time zone 'Europe/Rome'
                      and b.starts_at < ((n.starts_at at time zone 'Europe/Rome')::date + 2)::timestamp at time zone 'Europe/Rome') q), '[]'::jsonb),
               'mine', (select s.id from public.shows s where s.jeweler_id = j.id and s.night_id = n.id order by s.scheduled_at limit 1)
             ) order by n.starts_at)
        from public.nights n
       where n.is_public and j.night_theme is not null and n.title = j.night_theme
         and (n.starts_at at time zone 'Europe/Rome')::date > (now() at time zone 'Europe/Rome')::date
         and n.starts_at < now() + make_interval(weeks => (public._cal_rules()->>'weeks')::int)), '[]'::jsonb),
    'mine', coalesce((
      select jsonb_agg(jsonb_build_object('show_id', s.id, 'title', s.title, 'at', s.scheduled_at, 'status', s.status, 'night_id', s.night_id,
               'day', public._show_day(s),
               'gem_status', (select g.status from public.gem_bookings g where g.show_id = s.id and g.status <> 'annullata' limit 1)) order by s.scheduled_at)
        from public.shows s
       where s.jeweler_id = j.id and s.scheduled_at > date_trunc('month', now() at time zone 'Europe/Rome') at time zone 'Europe/Rome' - interval '7 days'), '[]'::jsonb)
  ) into v_out;
  return v_out;
end $$;

-- ---------- prenotare una diretta: il giorno della serata, all'ora che vuole il seller (p_tz: il suo fuso orario)
create or replace function public.book_live(p_token text, p_jeweler uuid, p_night uuid, p_at timestamptz, p_tz text, p_title text, p_gem boolean default false)
 returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_role text; j public.jewelers; n public.nights; v_tz text; v_day date; v_sub public.subscriptions; v_cnt int;
        v_show public.shows; r jsonb := public._cal_rules(); v_gem text;
begin
  select role into v_role from public.staff_jeweler(p_token, p_jeweler);
  if v_role is null then raise exception 'Token non valido'; end if;
  select * into j from public.jewelers where id = p_jeweler for update;   -- una prenotazione alla volta per seller
  if j.night_theme is null then raise exception 'Il tuo calendario non è ancora attivo: la serata te la assegna Uniqaia.'; end if;
  select * into n from public.nights where id = p_night;
  if n.id is null or not n.is_public then raise exception 'Serata non trovata.'; end if;
  if n.title is distinct from j.night_theme then raise exception 'Puoi prenotare solo le serate %.', j.night_theme; end if;
  if p_at is null or not isfinite(p_at) then raise exception 'Scegli l''ora della diretta.'; end if;
  v_tz := case when exists (select 1 from pg_timezone_names where name = p_tz) then p_tz else 'Europe/Rome' end;
  v_day := (n.starts_at at time zone 'Europe/Rome')::date;
  if (p_at at time zone v_tz)::date <> v_day then
    raise exception 'La diretta deve cominciare il giorno della serata (%), nel tuo fuso orario.', to_char(v_day, 'DD/MM');
  end if;
  if extract(second from p_at) <> 0 or extract(minute from p_at at time zone 'UTC')::int % (r->>'step_min')::int <> 0 then
    raise exception 'Scegli un orario a quarti d''ora (per esempio 18:00, 18:15, 18:30).';
  end if;
  if v_role = 'jeweler' and p_at < now() + make_interval(hours => (r->>'book_min_hours')::int) then
    raise exception 'Si prenota fino a % ore prima.', r->>'book_min_hours';
  end if;
  if p_at > now() + make_interval(weeks => (r->>'weeks')::int) + interval '2 days' then raise exception 'Questa serata non è ancora prenotabile.'; end if;
  if exists (select 1 from public.shows s where s.jeweler_id = j.id and s.scheduled_at < p_at + interval '1 hour' and s.scheduled_at + interval '1 hour' > p_at) then
    raise exception 'Hai già una diretta in quest''orario.';
  end if;
  -- una a settimana: la settimana della serata (da lunedì a domenica)
  select count(*) into v_cnt from public.shows s
   where s.jeweler_id = j.id and date_trunc('week', public._show_day(s)) = date_trunc('week', v_day);
  if v_cnt >= (r->>'per_week')::int then raise exception 'Hai già una diretta in questa settimana: se ne prenota una a settimana.'; end if;
  -- quattro al mese: il mese dell'abbonamento se c'è (stessa regola di oggi), altrimenti il mese della serata
  select * into v_sub from public.subscriptions where jeweler_id = j.id;
  if v_sub.id is not null then
    perform public._show_quota(j.id, p_at, null);
  else
    select count(*) into v_cnt from public.shows s
     where s.jeweler_id = j.id and date_trunc('month', public._show_day(s)) = date_trunc('month', v_day);
    if v_cnt >= (r->>'per_month')::int then raise exception 'Hai già prenotato le % dirette di questo mese.', r->>'per_month'; end if;
  end if;
  if coalesce(p_gem, false) then
    perform pg_advisory_xact_lock(hashtext('gem_bookings'));   -- due prenotazioni della gemmologa nello stesso istante: passa la prima
    if not public._gem_free(p_at, null) then
      raise exception 'La gemmologa non è disponibile a quest''ora. Prenota senza gemmologa o scegli un''altra ora.';
    end if;
  end if;
  insert into public.shows (jeweler_id, title, scheduled_at, lang, night_id, categories, duration_min, visibility)
  values (j.id, left(coalesce(nullif(trim(p_title), ''), n.title), 120), p_at, 'it', n.id,
          case when n.category is not null then array[n.category] else '{}'::text[] end, (r->>'duration_min')::int, 'public')
  returning * into v_show;
  if coalesce(p_gem, false) then
    insert into public.gem_bookings (show_id, jeweler_id, starts_at, ends_at, price_cents)
    values (v_show.id, j.id, p_at, p_at + interval '1 hour', (r->>'gem_cents')::int);
    v_gem := 'da_pagare';
  end if;
  return jsonb_build_object('show_id', v_show.id, 'at', p_at, 'gem_status', v_gem);
end $$;

-- ---------- aggiungere o togliere la gemmologa a una diretta già prenotata
create or replace function public.set_live_gem(p_token text, p_show uuid, p_on boolean)
 returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_role text; s public.shows; g public.gem_bookings; r jsonb := public._cal_rules();
begin
  select role into v_role from public.staff_check(p_token, p_show);
  if v_role is null then raise exception 'Token non valido'; end if;
  select * into s from public.shows where id = p_show for update;
  if s.status <> 'scheduled' then raise exception 'Si cambia solo una diretta non ancora iniziata.'; end if;
  select * into g from public.gem_bookings where show_id = p_show;
  if coalesce(p_on, false) then
    if g.id is not null and g.status <> 'annullata' then return jsonb_build_object('gem_status', g.status); end if;
    if v_role = 'jeweler' and s.scheduled_at < now() + make_interval(hours => (r->>'book_min_hours')::int) then
      raise exception 'La gemmologa si prenota fino a % ore prima.', r->>'book_min_hours';
    end if;
    perform pg_advisory_xact_lock(hashtext('gem_bookings'));
    if not public._gem_free(s.scheduled_at, p_show) then raise exception 'La gemmologa non è disponibile a quest''ora.'; end if;
    if g.id is not null then
      update public.gem_bookings set status = 'da_pagare', starts_at = s.scheduled_at, ends_at = s.scheduled_at + interval '1 hour', paid_at = null, updated_at = now() where id = g.id;
    else
      insert into public.gem_bookings (show_id, jeweler_id, starts_at, ends_at, price_cents) values (s.id, s.jeweler_id, s.scheduled_at, s.scheduled_at + interval '1 hour', (r->>'gem_cents')::int);
    end if;
    return jsonb_build_object('gem_status', 'da_pagare');
  else
    if g.id is null or g.status = 'annullata' then return jsonb_build_object('gem_status', null); end if;
    if v_role = 'jeweler' and g.status = 'pagata' then raise exception 'La gemmologa è già pagata: per annullarla scrivi a Uniqaia.'; end if;
    if v_role = 'jeweler' and s.scheduled_at < now() + make_interval(hours => (r->>'cancel_min_hours')::int) then
      raise exception 'La gemmologa si annulla fino a % ore prima.', r->>'cancel_min_hours';
    end if;
    update public.gem_bookings set status = 'annullata', updated_at = now() where id = g.id;
    return jsonb_build_object('gem_status', null);
  end if;
end $$;

-- ---------- annullare una diretta prenotata dal calendario
create or replace function public.cancel_live(p_token text, p_show uuid)
 returns void language plpgsql security definer set search_path to 'public' as $$
declare v_role text; s public.shows; r jsonb := public._cal_rules();
begin
  select role into v_role from public.staff_check(p_token, p_show);
  if v_role is null then raise exception 'Token non valido'; end if;
  select * into s from public.shows where id = p_show for update;
  if s.night_id is null then raise exception 'Si annullano da qui solo le dirette prenotate dal calendario.'; end if;
  if s.status <> 'scheduled' then raise exception 'Si annulla solo una diretta non ancora iniziata.'; end if;
  if v_role = 'jeweler' and s.scheduled_at < now() + make_interval(hours => (r->>'cancel_min_hours')::int) then
    raise exception 'Una diretta si annulla fino a % ore prima.', r->>'cancel_min_hours';
  end if;
  if exists (select 1 from public.gem_bookings g where g.show_id = s.id and g.status = 'pagata') and v_role = 'jeweler' then
    raise exception 'Hai già pagato la gemmologa per questa diretta: per annullarla scrivi a Uniqaia.';
  end if;
  -- i dati dei clienti non si cancellano: se qualcuno ha già scritto, si annulla solo con Uniqaia
  if exists (select 1 from public.requests where show_id = s.id) or exists (select 1 from public.viewer_signups where show_id = s.id)
     or exists (select 1 from public.payment_links where show_id = s.id) or exists (select 1 from public.invites where show_id = s.id) then
    raise exception 'Questa diretta ha già richieste o inviti dei clienti: per annullarla scrivi a Uniqaia.';
  end if;
  delete from public.shows where id = s.id;   -- con lei se ne vanno pezzi e messaggi del seller, e la prenotazione della gemmologa
end $$;

-- ---------- per Elena: la serata del seller, le prenotazioni della gemmologa, le ore bloccate
create or replace function public.set_seller_theme(p_token text, p_jeweler uuid, p_theme text)
 returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_gemologist(p_token) then raise exception 'Token non valido'; end if;
  if p_theme is not null and not exists (select 1 from public.nights where title = p_theme and starts_at > now()) then
    raise exception 'Serata non valida: %', p_theme;
  end if;
  update public.jewelers set night_theme = nullif(trim(p_theme), '') where id = p_jeweler;
  if not found then raise exception 'Venditore non trovato'; end if;
end $$;

create or replace function public.night_themes(p_token text)
 returns table(title text, next_at timestamptz, nights bigint) language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.is_gemologist(p_token) then raise exception 'Token non valido'; end if;
  return query select n.title, min(n.starts_at), count(*) from public.nights n
                where n.is_public and n.starts_at > now() group by n.title order by min(n.starts_at);
end $$;

create or replace function public.gem_admin_list(p_token text)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.is_gemologist(p_token) then raise exception 'Token non valido'; end if;
  return jsonb_build_object(
    'bookings', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'at', g.starts_at, 'status', g.status, 'price_cents', g.price_cents,
                  'seller', j.name, 'slug', j.slug, 'show_title', s.title, 'paid_at', g.paid_at) order by g.starts_at)
                from public.gem_bookings g join public.shows s on s.id = g.show_id join public.jewelers j on j.id = g.jeweler_id
               where g.starts_at > now() - interval '30 days'), '[]'::jsonb),
    'blocks', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'from', b.starts_at, 'to', b.ends_at, 'note', b.note) order by b.starts_at)
                from public.gem_blocks b where b.ends_at > now()), '[]'::jsonb),
    'themes', coalesce((select jsonb_agg(jsonb_build_object('id', j.id, 'name', j.name, 'slug', j.slug, 'theme', j.night_theme) order by j.name)
                from public.jewelers j), '[]'::jsonb));
end $$;

create or replace function public.gem_mark(p_token text, p_id uuid, p_status text)
 returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_gemologist(p_token) then raise exception 'Token non valido'; end if;
  if p_status not in ('da_pagare', 'pagata', 'annullata') then raise exception 'Stato non valido'; end if;
  update public.gem_bookings set status = p_status, paid_at = case when p_status = 'pagata' then now() else null end, updated_at = now() where id = p_id;
end $$;

create or replace function public.gem_block_add(p_token text, p_from timestamptz, p_to timestamptz, p_note text)
 returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v uuid;
begin
  if not public.is_gemologist(p_token) then raise exception 'Token non valido'; end if;
  if p_from is null or p_to is null or p_to <= p_from then raise exception 'Intervallo non valido'; end if;
  insert into public.gem_blocks (starts_at, ends_at, note) values (p_from, p_to, left(p_note, 200)) returning id into v;
  return v;
end $$;

create or replace function public.gem_block_remove(p_token text, p_id uuid)
 returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_gemologist(p_token) then raise exception 'Token non valido'; end if;
  delete from public.gem_blocks where id = p_id;
end $$;

-- ---------- le due funzioni esistenti: identiche a prima, più un controllo per i seller collegati a una serata
create or replace function public.create_show(p_token text, p_jeweler uuid, p_title text, p_at timestamp with time zone, p_lang text, p_slots jsonb)
 returns shows
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_role text; v_row public.shows; v_at timestamptz := coalesce(p_at, now()); v_sub boolean;
begin
  select role into v_role from public.staff_jeweler(p_token, p_jeweler);
  if v_role is null then raise exception 'Token non valido'; end if;
  -- calendario (7/11/2026): chi è collegato a una serata prenota dal calendario
  if v_role = 'jeweler' and exists (select 1 from public.jewelers where id = p_jeweler and night_theme is not null) then
    raise exception 'Le dirette si prenotano dal calendario.';
  end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Titolo mancante'; end if;
  v_sub := exists (select 1 from public.subscriptions where jeweler_id = p_jeweler);
  if v_role = 'jeweler' then perform public._show_quota(p_jeweler, v_at, null); end if;
  insert into public.shows (jeweler_id, title, scheduled_at, lang, slots, duration_min)
  values (p_jeweler, left(trim(p_title), 120), v_at, coalesce(nullif(p_lang, ''), 'it'), coalesce(p_slots, '[]'::jsonb),
          case when v_sub then public._plan('PLAN_LIVE_MAX_MIN') end)
  returning * into v_row;
  return v_row;
end $function$;

create or replace function public.update_show2(p_show uuid, p_token text, p_title text, p_at timestamp with time zone, p_lang text, p_slots jsonb, p_i18n jsonb, p_vis text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_role text; sh public.shows;
begin
  select role into v_role from staff_check(p_token, p_show);
  if v_role is null then raise exception 'Token non valido'; end if;
  select * into sh from public.shows where id = p_show;
  -- calendario (7/11/2026): una diretta prenotata dal calendario cambia data solo annullandola e prenotando di nuovo
  if v_role = 'jeweler' and sh.night_id is not null and p_at is not null and p_at is distinct from sh.scheduled_at then
    raise exception 'Per cambiare data annulla la diretta e prenotane un''altra dal calendario.';
  end if;
  if v_role = 'jeweler' and p_at is not null and p_at is distinct from sh.scheduled_at then
    perform public._show_quota(sh.jeweler_id, p_at, p_show);
  end if;
  update shows set
    title = coalesce(nullif(left(trim(p_title), 120), ''), title),
    scheduled_at = coalesce(p_at, scheduled_at),
    lang = coalesce(nullif(p_lang, ''), lang),
    slots = coalesce(p_slots, slots),
    title_i18n = coalesce(p_i18n, title_i18n),
    visibility = coalesce(nullif(p_vis, ''), visibility)
  where id = p_show;
end $function$;

commit;

-- Controllo: devono comparire le sei serate da assegnare ai seller.
select title, min(starts_at at time zone 'Europe/Rome') as prossima, count(*) as serate
  from public.nights where is_public and starts_at > now() group by title order by 2;

-- Per tornare indietro: le due funzioni sono in backup.functions_20261107b.def;
-- tabelle e funzioni nuove si possono togliere senza toccare il resto.
