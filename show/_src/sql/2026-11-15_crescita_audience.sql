-- 15/11/2026 · Crescita dell'audience (brief di Elena del 15/11, claude/sviluppo/crescita-audience/brief.md)
-- Remind Me con promemoria via email, Share con le misure, Raid fra dirette, referral (premi spenti).
-- Si applica SOLO dopo l'OK di Elena, con i testi del Legal pubblicati lo stesso giorno (LEG-015, risposta del 15/11 alle 12:45). Si può rieseguire: non cancella dati.
-- Scelte di Elena del 15/11: referral senza memoria nel browser; «N people are interested»; tempi di conservazione del Legal; caselle dei promemoria già spuntate.
-- Regole: tutte le tabelle nuove hanno la RLS accesa e nessuna policy. Dal sito si passa solo dalle funzioni qui sotto.
-- Ai seller arrivano solo numeri, mai email, nomi o salvataggi dei singoli spettatori (LEG-013, LEG-015).

-- ============================================================ profili degli spettatori
create table if not exists public.viewer_profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  ref_code    text not null unique,
  lang        text not null default 'en' check (lang in ('en','it','fr','ru','ar')),
  tz          text not null default 'Europe/Rome',
  reminders   boolean not null default true,            -- interruttore di tutti i promemoria
  unsub_token text not null unique default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  created_at  timestamptz not null default now()
);
alter table public.viewer_profiles enable row level security;

-- Dirette e serate salvate con «Remind Me»
create table if not exists public.saved_lives (
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('show','night')),
  target_id  uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, target_id)
);
alter table public.saved_lives add column if not exists rem24 boolean not null default true;   -- email 24 ore prima (casella già spuntata, scelta di Elena)
alter table public.saved_lives add column if not exists rem15 boolean not null default true;   -- email 15 minuti prima
-- versioni dell'informativa e delle condizioni d'uso accettate creando l'account (LEG-015, E.13)
alter table public.viewer_profiles add column if not exists privacy_version text;
alter table public.viewer_profiles add column if not exists terms_version text;
create index if not exists saved_lives_target on public.saved_lives (kind, target_id);
alter table public.saved_lives enable row level security;

-- Registro dei promemoria mandati: la chiave impedisce i doppioni. Se l'orario cambia, cambia target_at e il promemoria riparte per l'orario nuovo.
create table if not exists public.reminder_log (
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null,
  target_id  uuid not null,
  slot       text not null check (slot in ('24h','15m','moved','cancelled')),
  target_at  timestamptz not null,
  outbox_id  bigint,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, target_id, slot, target_at)
);
alter table public.reminder_log enable row level security;
-- totali che restano dopo i 12 mesi delle misure (LEG-015, sezione F)
create table if not exists public.growth_totals (
  month date not null, metric text not null, kind text not null default '', channel text not null default '', n integer not null default 0,
  primary key (month, metric, kind, channel)
);
alter table public.growth_totals enable row level security;

-- ============================================================ condivisioni (solo numeri, nessun identificativo)
create table if not exists public.share_events (
  id bigserial primary key, created_at timestamptz not null default now(),
  kind text not null check (kind in ('show','night','seller','home')), target_id uuid,
  channel text not null check (channel in ('native','wa','fb','tg','rd','em','copy'))
);
create table if not exists public.share_visits (
  id bigserial primary key, created_at timestamptz not null default now(),
  kind text not null check (kind in ('show','night','seller','home')), target_id uuid,
  channel text not null check (channel in ('native','wa','fb','tg','rd','em','copy'))
);
create table if not exists public.share_signups (
  id bigserial primary key, created_at timestamptz not null default now(),
  kind text not null, target_id uuid, channel text not null
);
alter table public.share_events enable row level security;
alter table public.share_visits enable row level security;
alter table public.share_signups enable row level security;

-- ============================================================ Raid
alter table public.shows add column if not exists accept_raids boolean not null default true;
alter table public.shows add column if not exists raid_id uuid;
create table if not exists public.raids (
  id         uuid primary key default gen_random_uuid(),
  from_show  uuid not null references public.shows(id) on delete cascade,
  to_show    uuid not null references public.shows(id) on delete cascade,
  invited    integer,
  status     text not null default 'active' check (status in ('active','cancelled')),
  created_at timestamptz not null default now()
);
create table if not exists public.raid_events (
  id bigserial primary key,
  raid_id uuid not null references public.raids(id) on delete cascade,
  event text not null check (event in ('accept','stay','arrive')),
  created_at timestamptz not null default now()
);
create index if not exists raid_events_raid on public.raid_events (raid_id, event);
alter table public.raids enable row level security;
alter table public.raid_events enable row level security;

-- ============================================================ referral (premi spenti)
create table if not exists public.referral_attributions (
  user_id     uuid primary key references auth.users(id) on delete cascade,   -- una sola attribuzione per account
  referrer    uuid not null references auth.users(id) on delete cascade,
  code        text not null,
  captured_at timestamptz,
  status      text not null default 'valid' check (status in ('valid','void')),
  void_reason text,
  created_at  timestamptz not null default now(),
  check (user_id <> referrer)                                                   -- niente auto-referral
);
create index if not exists referral_attr_referrer on public.referral_attributions (referrer, status);
-- Struttura per un futuro programma Ambassador: nessuna riga, tutto spento. Si accende solo con l'OK esplicito di Elena e del Legal.
create table if not exists public.referral_rewards (
  id         serial primary key,
  kind       text not null check (kind in ('credit','perk','event','qualified')),
  label      jsonb not null default '{}'::jsonb,
  threshold  integer not null default 1,
  active     boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.referral_attributions enable row level security;
alter table public.referral_rewards enable row level security;

-- ============================================================ funzioni di servizio
create or replace function public._ref_code() returns text language plpgsql volatile set search_path = public as $$
declare a text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; b bytea; c text;
begin
  loop
    b := decode(replace(gen_random_uuid()::text, '-', ''), 'hex'); c := '';
    for i in 0..7 loop c := c || substr(a, (get_byte(b, i) % 32) + 1, 1); end loop;
    exit when not exists (select 1 from public.viewer_profiles where ref_code = c);
  end loop;
  return c;
end $$;

create or replace function public._lang_ok(p text) returns text language sql immutable as $$
  select case when p in ('en','it','fr','ru','ar') then p else 'en' end $$;

create or replace function public._tz_ok(p text) returns text language sql stable as $$
  select name from pg_timezone_names where name = p limit 1 $$;

create or replace function public._share_ch_ok(p text) returns boolean language sql immutable as $$
  select p in ('native','wa','fb','tg','rd','em','copy') $$;

-- la diretta o la serata esiste, è pubblica e non è passata
create or replace function public._life_ok(p_kind text, p_id uuid) returns boolean language sql stable set search_path = public as $$
  select case p_kind
    when 'show'  then exists (select 1 from shows s where s.id = p_id and s.visibility = 'public' and s.status in ('scheduled','live'))
    when 'night' then exists (select 1 from nights n where n.id = p_id and n.is_public and n.starts_at > now() - interval '1 day')
    else false end $$;

create or replace function public._ensure_profile(p_uid uuid) returns void language sql security definer set search_path = public as $$
  insert into viewer_profiles (user_id, ref_code) values (p_uid, _ref_code()) on conflict (user_id) do nothing $$;

-- ============================================================ account
-- Dopo l'accesso: crea il profilo e, solo per un account nuovo con l'email verificata, attribuisce il referral e la registrazione nata da una condivisione.
create or replace function public.viewer_init(p_lang text default 'en', p_tz text default null, p_ref text default null, p_ref_at timestamptz default null,
                                              p_sh_kind text default null, p_sh_id uuid default null, p_sh_ch text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_p viewer_profiles; v_new boolean := false; v_ref uuid; v_u auth.users; v_code text;
begin
  if v_uid is null then raise exception 'login required' using errcode = '28000'; end if;
  select * into v_u from auth.users where id = v_uid;
  insert into viewer_profiles (user_id, ref_code, lang, tz, privacy_version, terms_version)
    values (v_uid, _ref_code(), _lang_ok(p_lang), coalesce(_tz_ok(p_tz), 'Europe/Rome'), '1.1', '1.1')
    on conflict (user_id) do nothing returning * into v_p;
  if v_p.user_id is not null then v_new := true;
  else
    update viewer_profiles set lang = _lang_ok(p_lang), tz = coalesce(_tz_ok(p_tz), tz) where user_id = v_uid returning * into v_p;
  end if;
  -- account nuovo: creato da meno di un giorno con il codice o il link via email, senza password (così l'email è verificata davvero
  -- anche con «Confirm email» spento per i seller); chi aveva già un account, per esempio un seller, non conta come registrazione nuova.
  -- Referral senza memoria nel browser (scelta di Elena del 15/11): il codice arriva dal link alla registrazione (p_ref o dati dell'account).
  v_code := upper(btrim(coalesce(nullif(p_ref, ''), v_u.raw_user_meta_data ->> 'ref', '')));
  if v_new and v_u.email_confirmed_at is not null and v_u.created_at > now() - interval '1 day' and coalesce(v_u.encrypted_password, '') = '' then
    if v_code ~ '^[A-Z0-9]{8}$' and coalesce(p_ref_at, now()) > now() - interval '30 days' and coalesce(p_ref_at, now()) < now() + interval '10 minutes' then
      select user_id into v_ref from viewer_profiles where ref_code = v_code and user_id <> v_uid;
      if v_ref is not null then
        insert into referral_attributions (user_id, referrer, code, captured_at) values (v_uid, v_ref, v_code, coalesce(p_ref_at, now())) on conflict (user_id) do nothing;
      end if;
    end if;
    if _share_ch_ok(p_sh_ch) and p_sh_kind in ('show','night','seller','home') then
      -- solo il giorno, così il numero non si può collegare all'ora di nascita dell'account (LEG-015, E.4)
      insert into share_signups (created_at, kind, target_id, channel) values (date_trunc('day', now()), p_sh_kind, p_sh_id, p_sh_ch);
    end if;
  end if;
  return jsonb_build_object('ref_code', v_p.ref_code, 'reminders', v_p.reminders, 'lang', v_p.lang, 'new', v_new);
end $$;

-- Pagina personale: profilo e numero di inviti validi (solo il numero, mai chi; LEG-015, 4.11)
create or replace function public.my_profile() returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_p viewer_profiles;
begin
  if v_uid is null then raise exception 'login required' using errcode = '28000'; end if;
  perform _ensure_profile(v_uid);
  select * into v_p from viewer_profiles where user_id = v_uid;
  return jsonb_build_object(
    'email', (select email from auth.users where id = v_uid),
    'ref_code', v_p.ref_code, 'reminders', v_p.reminders, 'lang', v_p.lang, 'tz', v_p.tz,
    'invited', (select count(*) from referral_attributions where referrer = v_uid and status = 'valid'));
end $$;

create or replace function public.set_reminders(p_on boolean) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'login required' using errcode = '28000'; end if;
  perform _ensure_profile(auth.uid());
  update viewer_profiles set reminders = coalesce(p_on, true) where user_id = auth.uid();
  return coalesce(p_on, true);
end $$;

-- Dal link in fondo alle email dei promemoria: spegne i promemoria senza accesso
-- p_kind e p_id: spegne solo i promemoria di quella diretta o serata; senza: tutti (LEG-015, sezione D)
drop function if exists public.reminders_off(text);
create or replace function public.reminders_off(p_token text, p_kind text default null, p_id uuid default null) returns boolean language plpgsql security definer set search_path = public as $$
declare v_uid uuid;
begin
  if p_token is null or length(p_token) <> 64 then return false; end if;
  select user_id into v_uid from viewer_profiles where unsub_token = p_token;
  if v_uid is null then return false; end if;
  if p_kind is not null and p_id is not null then
    update saved_lives set rem24 = false, rem15 = false where user_id = v_uid and kind = p_kind and target_id = p_id;
  else
    update viewer_profiles set reminders = false where user_id = v_uid;
  end if;
  return true;
end $$;

-- Cancella l'account dello spettatore e tutto ciò che ha salvato (a cascata)
create or replace function public.delete_my_account() returns boolean language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'login required' using errcode = '28000'; end if;
  -- un account che è anche di un seller non si cancella da qui
  if exists (select 1 from seller_accounts where user_id = v_uid) then raise exception 'seller account' using errcode = '42501'; end if;
  delete from auth.users where id = v_uid;
  return true;
end $$;

-- ============================================================ Remind Me
drop function if exists public.save_life(text, uuid, boolean);
create or replace function public.save_life(p_kind text, p_id uuid, p_on boolean default true, p_rem24 boolean default true, p_rem15 boolean default true) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'login required' using errcode = '28000'; end if;
  if p_kind not in ('show','night') then raise exception 'kind'; end if;
  if coalesce(p_on, true) then
    if not _life_ok(p_kind, p_id) then raise exception 'not available' using errcode = 'P0002'; end if;
    perform _ensure_profile(v_uid);
    insert into saved_lives (user_id, kind, target_id, rem24, rem15) values (v_uid, p_kind, p_id, coalesce(p_rem24, true), coalesce(p_rem15, true)) on conflict do nothing;
  else
    delete from saved_lives where user_id = v_uid and kind = p_kind and target_id = p_id;
  end if;
  return jsonb_build_object('saved', coalesce(p_on, true), 'n', (select n from interested(p_kind, array[p_id])));
end $$;

create or replace function public.set_life_reminders(p_kind text, p_id uuid, p_rem24 boolean, p_rem15 boolean) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'login required' using errcode = '28000'; end if;
  update saved_lives set rem24 = coalesce(p_rem24, rem24), rem15 = coalesce(p_rem15, rem15) where user_id = auth.uid() and kind = p_kind and target_id = p_id;
  return found;
end $$;

-- Numeri veri degli interessati (anche per chi non ha l'account) e, per chi è entrato, quali ha salvato
create or replace function public.interested(p_kind text, p_ids uuid[]) returns table (target_id uuid, n integer, mine boolean)
language sql stable security definer set search_path = public as $$
  select x.id, (select count(*)::int from saved_lives s join auth.users u on u.id = s.user_id and u.email_confirmed_at is not null where s.kind = p_kind and s.target_id = x.id),
         coalesce(auth.uid() is not null and exists (select 1 from saved_lives s where s.kind = p_kind and s.target_id = x.id and s.user_id = auth.uid()), false)
    from unnest(p_ids[1:200]) as x(id) $$;

-- My Saved Lives
create or replace function public.my_saved() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'at'), '[]'::jsonb) from (
    select jsonb_build_object('kind', 'show', 'id', s.id, 'title', s.title, 'title_i18n', s.title_i18n, 'at', s.scheduled_at, 'status', s.status,
                              'seller', j.name, 'seller_slug', j.slug, 'slug', s.slug, 'category', (s.categories)[1], 'rem24', sl.rem24, 'rem15', sl.rem15) x
      from saved_lives sl join shows s on s.id = sl.target_id join jewelers j on j.id = s.jeweler_id
     where sl.user_id = auth.uid() and sl.kind = 'show' and s.visibility = 'public' and (s.status <> 'ended' or s.ended_at > now() - interval '7 days')
    union all
    select jsonb_build_object('kind', 'night', 'id', n.id, 'title', n.title, 'title_i18n', n.title_i18n, 'at', n.starts_at, 'status', 'scheduled', 'category', n.category, 'rem24', sl.rem24, 'rem15', sl.rem15)
      from saved_lives sl join nights n on n.id = sl.target_id
     where sl.user_id = auth.uid() and sl.kind = 'night' and n.is_public and n.starts_at > now() - interval '1 day'
  ) q $$;

-- ============================================================ Share
-- Una condivisione si conta quando si sceglie un canale, non quando si apre il menu. Nessun dato della persona.
create or replace function public.record_share(p_kind text, p_id uuid, p_channel text) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not _share_ch_ok(p_channel) or p_kind not in ('show','night','seller','home') then return false; end if;
  if (select count(*) from share_events where created_at > now() - interval '1 minute') > 600 then return false; end if;
  insert into share_events (kind, target_id, channel) values (p_kind, p_id, p_channel);
  return true;
end $$;

-- Clic su un link condiviso (il canale arriva nell'indirizzo, ?sh=…)
create or replace function public.record_visit(p_kind text, p_id uuid, p_channel text) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not _share_ch_ok(p_channel) or p_kind not in ('show','night','seller','home') then return false; end if;
  if (select count(*) from share_visits where created_at > now() - interval '1 minute') > 1200 then return false; end if;
  insert into share_visits (kind, target_id, channel) values (p_kind, p_id, p_channel);
  return true;
end $$;

-- ============================================================ Raid
-- Dirette in onda che possono ricevere spettatori (per il pannello del seller che sta chiudendo)
create or replace function public.raid_targets(p_show uuid, p_token text) returns table (show_id uuid, title text, title_i18n jsonb, seller text, seller_slug text, categories text[], started_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_role text; v_j uuid;
begin
  select role into v_role from staff_check(p_token, p_show);
  if v_role is null then raise exception 'Token non valido'; end if;
  select jeweler_id into v_j from shows where id = p_show;
  return query
    select s.id, s.title, s.title_i18n, j.name, j.slug, s.categories, s.started_at
      from shows s join jewelers j on j.id = s.jeweler_id
     where s.status = 'live' and s.visibility = 'public' and s.accept_raids and s.id <> p_show and s.jeweler_id <> v_j
     order by s.started_at asc nulls last limit 20;   -- in ordine di inizio (LEG-015, condizioni dei seller 7.7)
end $$;

create or replace function public.start_raid(p_show uuid, p_token text, p_to uuid, p_invited integer default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_role text; v_from shows; v_to shows; v_id uuid;
begin
  select role into v_role from staff_check(p_token, p_show);
  if v_role is null then raise exception 'Token non valido'; end if;
  select * into v_from from shows where id = p_show;
  select * into v_to from shows where id = p_to;
  if v_from.status <> 'live' then raise exception 'La tua diretta non è in onda.'; end if;
  if v_to.id is null or v_to.status <> 'live' or v_to.visibility <> 'public' or not v_to.accept_raids or v_to.jeweler_id = v_from.jeweler_id then
    raise exception 'Questa diretta non può ricevere spettatori adesso.' using errcode = 'P0002';
  end if;
  update raids set status = 'cancelled' where from_show = p_show and status = 'active';
  insert into raids (from_show, to_show, invited) values (p_show, p_to, greatest(0, least(coalesce(p_invited, 0), 100000))) returning id into v_id;
  update shows set raid_id = v_id where id = p_show;
  return v_id;
end $$;

create or replace function public.cancel_raid(p_show uuid, p_token text) returns boolean language plpgsql security definer set search_path = public as $$
declare v_role text;
begin
  select role into v_role from staff_check(p_token, p_show);
  if v_role is null then raise exception 'Token non valido'; end if;
  update raids set status = 'cancelled' where from_show = p_show and status = 'active';
  update shows set raid_id = null where id = p_show;
  return true;
end $$;

-- Il seller di destinazione può rifiutare gli spettatori che arrivano da altre dirette
create or replace function public.set_accept_raids(p_show uuid, p_token text, p_on boolean) returns boolean language plpgsql security definer set search_path = public as $$
declare v_role text;
begin
  select role into v_role from staff_check(p_token, p_show);
  if v_role is null then raise exception 'Token non valido'; end if;
  update shows set accept_raids = coalesce(p_on, true) where id = p_show;
  return coalesce(p_on, true);
end $$;

-- Per lo spettatore: dove porta il Raid, e se la diretta di destinazione è ancora in onda
create or replace function public.raid_info(p_raid uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', r.id, 'from_show', r.from_show, 'to_show', r.to_show,
           'active', r.status = 'active' and s.status = 'live' and s.visibility = 'public' and s.accept_raids,
           'seller', j.name, 'seller_slug', j.slug, 'title', s.title, 'title_i18n', s.title_i18n, 'slug', s.slug)
    from raids r join shows s on s.id = r.to_show join jewelers j on j.id = s.jeweler_id where r.id = p_raid $$;

create or replace function public.raid_event(p_raid uuid, p_event text) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_event not in ('accept','stay','arrive') or not exists (select 1 from raids where id = p_raid) then return false; end if;
  if (select count(*) from raid_events where raid_id = p_raid and created_at > now() - interval '1 minute') > 3000 then return false; end if;
  insert into raid_events (raid_id, event) values (p_raid, p_event);
  return true;
end $$;

-- Numeri del Raid per il seller di origine
create or replace function public.raid_stats(p_show uuid, p_token text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_role text;
begin
  select role into v_role from staff_check(p_token, p_show);
  if v_role is null then raise exception 'Token non valido'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('raid', r.id, 'to_show', r.to_show, 'status', r.status, 'invited', r.invited, 'at', r.created_at,
            'accepted', (select count(*) from raid_events e where e.raid_id = r.id and e.event = 'accept'),
            'stayed', (select count(*) from raid_events e where e.raid_id = r.id and e.event = 'stay'),
            'arrived', (select count(*) from raid_events e where e.raid_id = r.id and e.event = 'arrive')) order by r.created_at desc), '[]'::jsonb)
          from raids r where r.from_show = p_show);
end $$;

-- ============================================================ referral: annullare un'attribuzione sospetta (solo Marketing Manager / Elena, dal database)
create or replace function public.referral_void(p_user uuid, p_reason text) returns boolean language sql security definer set search_path = public as $$
  update referral_attributions set status = 'void', void_reason = left(coalesce(p_reason, ''), 300) where user_id = p_user returning true $$;

-- ============================================================ promemoria: ogni 5 minuti
-- Pagine delle categorie, come CATPAGES in show/_src/build.mjs
create or replace function public._cat_page(p_cat text) returns text language sql immutable as $$
  select case p_cat when 'nuovi-talenti' then 'independent-designers' when 'fatto-a-mano' then 'the-gem-room' when 'gioielli-indiani' then 'collection'
                    when 'perle' then 'pearls-corals' when 'gemme-di-colore' then 'specials' when 'made-in-italy' then 'the-classics' end $$;

create or replace function public.growth_reminders() returns integer language plpgsql security definer set search_path = public as $$
declare r record; v_n integer := 0; v_id bigint; v_base text := rtrim(coalesce(_cfg('SITE_BASE'), 'https://uniqaia.com'), '/'); v_url text; v_title text;
begin
  for r in
    with t as (
      select sl.user_id, 'show'::text kind, s.id target_id, s.scheduled_at at, s.title, s.title_i18n, j.name seller, j.slug js, s.slug ss, null::text cat
        from saved_lives sl join shows s on s.id = sl.target_id join jewelers j on j.id = s.jeweler_id
       where sl.kind = 'show' and s.visibility = 'public' and s.status = 'scheduled'
      union all
      select sl.user_id, 'night', n.id, n.starts_at, n.title, n.title_i18n, null, null, null, n.category
        from saved_lives sl join nights n on n.id = sl.target_id
       where sl.kind = 'night' and n.is_public
    )
    select t.*, p.lang, p.tz, p.unsub_token, u.email, sl2.rem24, sl2.rem15,
           case when now() >= t.at - interval '24 hours' and now() < t.at - interval '23 hours' then '24h'
                when now() >= t.at - interval '15 minutes' and now() < t.at - interval '4 minutes' then '15m' end slot
      from t join viewer_profiles p on p.user_id = t.user_id and p.reminders
             join saved_lives sl2 on sl2.user_id = t.user_id and sl2.kind = t.kind and sl2.target_id = t.target_id
             join auth.users u on u.id = t.user_id and u.email_confirmed_at is not null and coalesce(u.email, '') <> ''
     where t.at > now() and t.at < now() + interval '25 hours'
  loop
    continue when r.slot is null;
    continue when (r.slot = '24h' and not r.rem24) or (r.slot = '15m' and not r.rem15);
    insert into reminder_log (user_id, kind, target_id, slot, target_at) values (r.user_id, r.kind, r.target_id, r.slot, r.at) on conflict do nothing;
    continue when not found;
    v_title := coalesce(nullif(r.title_i18n ->> r.lang, ''), nullif(r.title_i18n ->> 'en', ''), r.title, '');
    v_url := case when r.kind = 'show' then v_base || '/' || r.js || '/?s=' || r.target_id || '&lang=' || r.lang
                  when _cat_page(r.cat) is not null then v_base || '/c/' || _cat_page(r.cat) || '/?lang=' || r.lang
                  else v_base || '/?lang=' || r.lang end;
    insert into outbox (template, lang, to_email, data)
      values ('reminder', r.lang, lower(r.email), jsonb_build_object('slot', r.slot, 'kind', r.kind, 'title', v_title, 'seller', coalesce(r.seller, ''),
              'at', to_char(r.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'tz', r.tz, 'url', v_url,
              'off', v_base || '/me/?off=' || r.unsub_token || '&k=' || r.kind || '&id=' || r.target_id || '&lang=' || r.lang,
              'off_all', v_base || '/me/?off=' || r.unsub_token || '&lang=' || r.lang))
      returning id into v_id;
    update reminder_log set outbox_id = v_id where user_id = r.user_id and kind = r.kind and target_id = r.target_id and slot = r.slot and target_at = r.at;
    v_n := v_n + 1;
  end loop;
  if v_n > 0 then perform _poke_mailer(); end if;
  return v_n;
end $$;

-- ============================================================ avvisi di spostamento e annullamento
-- A chi ha salvato una diretta o una serata e tiene almeno un promemoria acceso: un'email se cambia l'orario (almeno 5 minuti)
-- o se viene annullata, tolta dal calendario o resa privata (LEG-015, 4.10 ed E.7). Un solo avviso per ogni cambio (reminder_log).
create or replace function public._life_notice(p_kind text, p_id uuid, p_what text, p_at timestamptz, p_old_at timestamptz,
                                               p_title text, p_title_i18n jsonb, p_seller text, p_js text, p_cat text)
returns integer language plpgsql security definer set search_path = public as $$
declare r record; v_n integer := 0; v_id bigint; v_base text := rtrim(coalesce(_cfg('SITE_BASE'), 'https://uniqaia.com'), '/'); v_url text; v_title text;
        v_key timestamptz := case when p_what = 'moved' then p_at else p_old_at end;
begin
  if p_old_at is null or p_old_at < now() then return 0; end if;   -- solo per dirette ancora da fare
  for r in
    select sl.user_id, p.lang, p.tz, p.unsub_token, u.email
      from saved_lives sl join viewer_profiles p on p.user_id = sl.user_id and p.reminders
           join auth.users u on u.id = sl.user_id and u.email_confirmed_at is not null and coalesce(u.email, '') <> ''
     where sl.kind = p_kind and sl.target_id = p_id and (sl.rem24 or sl.rem15)
  loop
    insert into reminder_log (user_id, kind, target_id, slot, target_at) values (r.user_id, p_kind, p_id, p_what, v_key) on conflict do nothing;
    continue when not found;
    v_title := coalesce(nullif(p_title_i18n ->> r.lang, ''), nullif(p_title_i18n ->> 'en', ''), p_title, '');
    v_url := case when p_kind = 'show' and p_what = 'moved' then v_base || '/' || p_js || '/?s=' || p_id || '&lang=' || r.lang
                  when p_kind = 'show' and p_js is not null then v_base || '/' || p_js || '/?lang=' || r.lang
                  when _cat_page(p_cat) is not null then v_base || '/c/' || _cat_page(p_cat) || '/?lang=' || r.lang
                  else v_base || '/?lang=' || r.lang end;
    insert into outbox (template, lang, to_email, data)
      values ('reminder_change', r.lang, lower(r.email), jsonb_build_object('change', p_what, 'kind', p_kind, 'title', v_title, 'seller', coalesce(p_seller, ''),
              'at', to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'old_at', to_char(p_old_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
              'tz', r.tz, 'url', v_url,
              'off', v_base || '/me/?off=' || r.unsub_token || '&k=' || p_kind || '&id=' || p_id || '&lang=' || r.lang,
              'off_all', v_base || '/me/?off=' || r.unsub_token || '&lang=' || r.lang))
      returning id into v_id;
    update reminder_log set outbox_id = v_id where user_id = r.user_id and kind = p_kind and target_id = p_id and slot = p_what and target_at = v_key;
    v_n := v_n + 1;
  end loop;
  if v_n > 0 then perform _poke_mailer(); end if;
  return v_n;
end $$;

-- Gli avvisi non devono mai bloccare il lavoro del seller o di Elena: in caso di errore resta solo un avviso nel log del database.
create or replace function public._shows_saved_trg() returns trigger language plpgsql security definer set search_path = public as $$
declare v_seller text; v_js text;
begin
  begin
    if tg_op = 'DELETE' then
      if old.status = 'scheduled' and old.visibility = 'public' then
        select name, slug into v_seller, v_js from jewelers where id = old.jeweler_id;
        perform _life_notice('show', old.id, 'cancelled', old.scheduled_at, old.scheduled_at, old.title, old.title_i18n, v_seller, v_js, null);
      end if;
      delete from saved_lives where kind = 'show' and target_id = old.id;
    elsif old.status = 'scheduled' and new.status = 'scheduled' and old.visibility = 'public' then
      select name, slug into v_seller, v_js from jewelers where id = new.jeweler_id;
      if new.visibility <> 'public' then
        perform _life_notice('show', new.id, 'cancelled', old.scheduled_at, old.scheduled_at, new.title, new.title_i18n, v_seller, v_js, null);
        delete from saved_lives where kind = 'show' and target_id = new.id;
      elsif abs(extract(epoch from new.scheduled_at - old.scheduled_at)) >= 300 then
        perform _life_notice('show', new.id, 'moved', new.scheduled_at, old.scheduled_at, new.title, new.title_i18n, v_seller, v_js, null);
      end if;
    end if;
  exception when others then
    raise warning 'avviso dirette salvate non mandato: %', sqlerrm;
  end;
  return coalesce(new, old);
end $$;

create or replace function public._nights_saved_trg() returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if tg_op = 'DELETE' then
      if old.is_public then
        perform _life_notice('night', old.id, 'cancelled', old.starts_at, old.starts_at, old.title, old.title_i18n, null, null, old.category);
      end if;
      delete from saved_lives where kind = 'night' and target_id = old.id;
    elsif old.is_public then
      if not new.is_public then
        perform _life_notice('night', new.id, 'cancelled', old.starts_at, old.starts_at, new.title, new.title_i18n, null, null, new.category);
        delete from saved_lives where kind = 'night' and target_id = new.id;
      elsif abs(extract(epoch from new.starts_at - old.starts_at)) >= 300 then
        perform _life_notice('night', new.id, 'moved', new.starts_at, old.starts_at, new.title, new.title_i18n, null, null, new.category);
      end if;
    end if;
  exception when others then
    raise warning 'avviso serate salvate non mandato: %', sqlerrm;
  end;
  return coalesce(new, old);
end $$;

drop trigger if exists shows_saved_notice on public.shows;
create trigger shows_saved_notice after update of scheduled_at, visibility or delete on public.shows for each row execute function public._shows_saved_trg();
drop trigger if exists nights_saved_notice on public.nights;
create trigger nights_saved_notice after update of starts_at, is_public or delete on public.nights for each row execute function public._nights_saved_trg();

-- ============================================================ pulizia (LEG-015, sezione F)
-- Gli account senza accessi da 24 mesi li cancella già legal.pulizia() (riga «auth_users»): con loro se ne vanno profilo, salvataggi e inviti.
create or replace function public.growth_cleanup() returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb := '{}'::jsonb; n integer; v_cut timestamptz := now() - interval '12 months';
begin
  -- dirette salvate: 30 giorni dopo la diretta o la serata, o subito se non esiste più
  delete from saved_lives sl
   where (sl.kind = 'show' and not exists (select 1 from shows s where s.id = sl.target_id and coalesce(s.ended_at, s.scheduled_at) > now() - interval '30 days'))
      or (sl.kind = 'night' and not exists (select 1 from nights x where x.id = sl.target_id and x.starts_at > now() - interval '30 days'));
  get diagnostics n = row_count; r := r || jsonb_build_object('saved_lives', n);
  -- registro dei promemoria mandati: 30 giorni dopo la diretta
  delete from reminder_log where target_at < now() - interval '30 days';
  get diagnostics n = row_count; r := r || jsonb_build_object('reminder_log', n);
  -- misure: 12 mesi, poi restano solo i totali del mese, senza la diretta
  with d as (delete from share_events where created_at < v_cut returning created_at, kind, channel)
  insert into growth_totals (month, metric, kind, channel, n) select date_trunc('month', created_at)::date, 'share', kind, channel, count(*) from d group by 1, 3, 4
    on conflict (month, metric, kind, channel) do update set n = growth_totals.n + excluded.n;
  with d as (delete from share_visits where created_at < v_cut returning created_at, kind, channel)
  insert into growth_totals (month, metric, kind, channel, n) select date_trunc('month', created_at)::date, 'visit', kind, channel, count(*) from d group by 1, 3, 4
    on conflict (month, metric, kind, channel) do update set n = growth_totals.n + excluded.n;
  with d as (delete from share_signups where created_at < v_cut returning created_at, kind, channel)
  insert into growth_totals (month, metric, kind, channel, n) select date_trunc('month', created_at)::date, 'signup', kind, channel, count(*) from d group by 1, 3, 4
    on conflict (month, metric, kind, channel) do update set n = growth_totals.n + excluded.n;
  with d as (delete from raid_events e where e.created_at < v_cut or e.raid_id in (select id from raids where created_at < v_cut) returning created_at, event)
  insert into growth_totals (month, metric, kind, channel, n) select date_trunc('month', created_at)::date, 'raid_' || event, '', '', count(*) from d group by 1, 2
    on conflict (month, metric, kind, channel) do update set n = growth_totals.n + excluded.n;
  with d as (delete from raids where created_at < v_cut returning created_at, coalesce(invited, 0) invited)
  insert into growth_totals (month, metric, kind, channel, n)
    select date_trunc('month', created_at)::date, m.metric, '', '', case when m.metric = 'raid' then count(*) else sum(invited) end
      from d cross join (values ('raid'), ('raid_invited')) m(metric) group by 1, 2
    on conflict (month, metric, kind, channel) do update set n = growth_totals.n + excluded.n;
  r := r || jsonb_build_object('misure_prima_di', to_char(v_cut, 'YYYY-MM-DD'));
  return r;
end $$;

-- legal.pulizia() di ogni notte (cron «legal-pulizia», 3:29): testo identico a quello letto in produzione il 15/11 verso le 12:45, più la riga «crescita».
-- Prima di applicare: rileggerla in produzione; se è cambiata, unire le due versioni.
create or replace function legal.pulizia() returns jsonb language plpgsql security definer set search_path to 'public', 'auth' as $function$
declare r jsonb := '{}'::jsonb; n int;
begin
  -- ingresso nelle dirette (e consenso al calendario): 12 mesi dall'ultima diretta della stessa email
  delete from public.viewer_signups v
   where lower(v.email) in (select lower(email) from public.viewer_signups group by lower(email) having max(created_at) < now() - interval '12 months');
  get diagnostics n = row_count; r := r || jsonb_build_object('viewer_signups', n);
  -- richieste ai seller e link di pagamento collegati: 12 mesi
  delete from public.payment_links where sent_at < now() - interval '12 months';
  get diagnostics n = row_count; r := r || jsonb_build_object('payment_links', n);
  delete from public.requests where created_at < now() - interval '12 months';
  get diagnostics n = row_count; r := r || jsonb_build_object('requests', n);
  -- chat: 30 giorni dalla fine della diretta
  delete from public.messages m using public.shows s
   where s.id = m.show_id and coalesce(s.ended_at, m.created_at) < now() - interval '30 days';
  get diagnostics n = row_count; r := r || jsonb_build_object('messages', n);
  -- inviti agli appuntamenti privati: 60 giorni dall'invito
  delete from public.invites where created_at < now() - interval '60 days';
  get diagnostics n = row_count; r := r || jsonb_build_object('invites', n);
  -- «Segui»: 24 mesi dall'iscrizione
  delete from public.follows where created_at < now() - interval '24 months';
  get diagnostics n = row_count; r := r || jsonb_build_object('follows', n);
  -- candidature non approvate: 12 mesi dall'esito
  delete from public.applications where status = 'rejected' and coalesce(decided_at, updated_at, created_at) < now() - interval '12 months';
  get diagnostics n = row_count; r := r || jsonb_build_object('applications', n);
  -- coda delle email (contiene i testi): 90 giorni
  delete from public.outbox where created_at < now() - interval '90 days' and status not in ('queued', 'sending');
  get diagnostics n = row_count; r := r || jsonb_build_object('outbox', n);
  -- ruota: dati tecnici non collegati a nessun seller, 90 giorni
  delete from public.wheel_events where created_at < now() - interval '90 days';
  get diagnostics n = row_count; r := r || jsonb_build_object('wheel_events', n);
  delete from public.wheel_spins w
   where w.created_at < now() - interval '90 days' and w.application_id is null and w.user_id is null and w.jeweler_id is null
     and not exists (select 1 from public.subscriptions s where s.spin_id = w.id);
  get diagnostics n = row_count; r := r || jsonb_build_object('wheel_spins', n);
  -- account senza candidatura né abbonamento: 24 mesi senza accessi
  delete from auth.users u
   where coalesce(u.last_sign_in_at, u.created_at) < now() - interval '24 months'
     and not exists (select 1 from public.applications a where a.user_id = u.id)
     and not exists (select 1 from public.subscriptions s where s.user_id = u.id);
  get diagnostics n = row_count; r := r || jsonb_build_object('auth_users', n);
  -- crescita dell'audience: dirette salvate, promemoria e misure (LEG-015, sezione F)
  r := r || jsonb_build_object('crescita', public.growth_cleanup());
  return r;
end $function$;

-- ============================================================ permessi
revoke all on function public._ref_code(), public._ensure_profile(uuid), public.growth_reminders(), public.referral_void(uuid, text),
  public._life_notice(text, uuid, text, timestamptz, timestamptz, text, jsonb, text, text, text), public._shows_saved_trg(), public._nights_saved_trg(),
  public.growth_cleanup() from public, anon, authenticated;
revoke all on function public.viewer_init(text, text, text, timestamptz, text, uuid, text), public.my_profile(), public.set_reminders(boolean),
  public.delete_my_account(), public.save_life(text, uuid, boolean, boolean, boolean), public.set_life_reminders(text, uuid, boolean, boolean), public.my_saved() from public, anon;
grant execute on function public.viewer_init(text, text, text, timestamptz, text, uuid, text), public.my_profile(), public.set_reminders(boolean),
  public.delete_my_account(), public.save_life(text, uuid, boolean, boolean, boolean), public.set_life_reminders(text, uuid, boolean, boolean), public.my_saved() to authenticated;
grant execute on function public.interested(text, uuid[]), public.reminders_off(text, text, uuid), public.record_share(text, uuid, text), public.record_visit(text, uuid, text),
  public.raid_targets(uuid, text), public.start_raid(uuid, text, uuid, integer), public.cancel_raid(uuid, text), public.set_accept_raids(uuid, text, boolean),
  public.raid_info(uuid), public.raid_event(uuid, text), public.raid_stats(uuid, text) to anon, authenticated;
-- «Iscriviti alla live» (follow_night) non è mai stata approvata: la sostituisce «Remind Me» (P1 #47 di Nikita)
revoke execute on function public.follow_night(text, uuid, text) from public, anon, authenticated;

-- ogni 5 minuti
select cron.schedule('crescita-promemoria', '*/5 * * * *', 'select public.growth_reminders()');
