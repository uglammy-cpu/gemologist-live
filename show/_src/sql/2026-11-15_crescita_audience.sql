-- 15/11/2026 · Crescita dell'audience (brief di Elena del 15/11, claude/sviluppo/crescita-audience/brief.md)
-- Remind Me con promemoria via email, Share con le misure, Raid fra dirette, referral (premi spenti).
-- Si applica SOLO dopo l'OK di Elena e la risposta del Legal (LEG-015). Si può rieseguire: non cancella dati.
-- Regole: tutte le tabelle nuove hanno la RLS accesa e nessuna policy. Dal sito si passa solo dalle funzioni qui sotto.
-- Ai seller arrivano solo numeri, mai email, nomi o salvataggi dei singoli spettatori (LEG-013, LEG-015).

-- ============================================================ profili degli spettatori
create table if not exists public.viewer_profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  ref_code    text not null unique,
  lang        text not null default 'en' check (lang in ('en','it','fr','ru','ar')),
  tz          text not null default 'Europe/Rome',
  reminders   boolean not null default true,
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
create index if not exists saved_lives_target on public.saved_lives (kind, target_id);
alter table public.saved_lives enable row level security;

-- Registro dei promemoria mandati: la chiave impedisce i doppioni. Se l'orario cambia, cambia target_at e il promemoria riparte per l'orario nuovo.
create table if not exists public.reminder_log (
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null,
  target_id  uuid not null,
  slot       text not null check (slot in ('24h','15m')),
  target_at  timestamptz not null,
  outbox_id  bigint,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, target_id, slot, target_at)
);
alter table public.reminder_log enable row level security;

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
declare v_uid uuid := auth.uid(); v_p viewer_profiles; v_new boolean := false; v_ref uuid; v_u auth.users;
begin
  if v_uid is null then raise exception 'login required' using errcode = '28000'; end if;
  select * into v_u from auth.users where id = v_uid;
  insert into viewer_profiles (user_id, ref_code, lang, tz) values (v_uid, _ref_code(), _lang_ok(p_lang), coalesce(_tz_ok(p_tz), 'Europe/Rome'))
    on conflict (user_id) do nothing returning * into v_p;
  if v_p.user_id is not null then v_new := true;
  else
    update viewer_profiles set lang = _lang_ok(p_lang), tz = coalesce(_tz_ok(p_tz), tz) where user_id = v_uid returning * into v_p;
  end if;
  -- account nuovo: creato da meno di un giorno (chi aveva già un account, per esempio un seller, non conta come registrazione nuova)
  if v_new and v_u.email_confirmed_at is not null and v_u.created_at > now() - interval '1 day' then
    if p_ref is not null and p_ref_at is not null and p_ref_at > now() - interval '30 days' and p_ref_at < now() + interval '10 minutes' then
      select user_id into v_ref from viewer_profiles where ref_code = upper(btrim(p_ref)) and user_id <> v_uid;
      if v_ref is not null then
        insert into referral_attributions (user_id, referrer, code, captured_at) values (v_uid, v_ref, upper(btrim(p_ref)), p_ref_at) on conflict (user_id) do nothing;
      end if;
    end if;
    if _share_ch_ok(p_sh_ch) and p_sh_kind in ('show','night','seller','home') then
      insert into share_signups (kind, target_id, channel) values (p_sh_kind, p_sh_id, p_sh_ch);
    end if;
  end if;
  return jsonb_build_object('ref_code', v_p.ref_code, 'reminders', v_p.reminders, 'lang', v_p.lang, 'new', v_new);
end $$;

-- Pagina personale: profilo, numero di inviti validi, stato dei premi (spenti)
create or replace function public.my_profile() returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_p viewer_profiles;
begin
  if v_uid is null then raise exception 'login required' using errcode = '28000'; end if;
  perform _ensure_profile(v_uid);
  select * into v_p from viewer_profiles where user_id = v_uid;
  return jsonb_build_object(
    'email', (select email from auth.users where id = v_uid),
    'ref_code', v_p.ref_code, 'reminders', v_p.reminders, 'lang', v_p.lang, 'tz', v_p.tz,
    'invited', (select count(*) from referral_attributions where referrer = v_uid and status = 'valid'),
    'rewards_active', exists (select 1 from referral_rewards where active));
end $$;

create or replace function public.set_reminders(p_on boolean) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'login required' using errcode = '28000'; end if;
  perform _ensure_profile(auth.uid());
  update viewer_profiles set reminders = coalesce(p_on, true) where user_id = auth.uid();
  return coalesce(p_on, true);
end $$;

-- Dal link in fondo alle email dei promemoria: spegne i promemoria senza accesso
create or replace function public.reminders_off(p_token text) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_token is null or length(p_token) <> 64 then return false; end if;
  update viewer_profiles set reminders = false where unsub_token = p_token;
  return found;
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
create or replace function public.save_life(p_kind text, p_id uuid, p_on boolean default true) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'login required' using errcode = '28000'; end if;
  if p_kind not in ('show','night') then raise exception 'kind'; end if;
  if coalesce(p_on, true) then
    if not _life_ok(p_kind, p_id) then raise exception 'not available' using errcode = 'P0002'; end if;
    perform _ensure_profile(v_uid);
    insert into saved_lives (user_id, kind, target_id) values (v_uid, p_kind, p_id) on conflict do nothing;
  else
    delete from saved_lives where user_id = v_uid and kind = p_kind and target_id = p_id;
  end if;
  return jsonb_build_object('saved', coalesce(p_on, true), 'n', (select count(*) from saved_lives where kind = p_kind and target_id = p_id));
end $$;

-- Numeri veri degli interessati (anche per chi non ha l'account) e, per chi è entrato, quali ha salvato
create or replace function public.interested(p_kind text, p_ids uuid[]) returns table (target_id uuid, n integer, mine boolean)
language sql stable security definer set search_path = public as $$
  select x.id, (select count(*)::int from saved_lives s where s.kind = p_kind and s.target_id = x.id),
         coalesce(auth.uid() is not null and exists (select 1 from saved_lives s where s.kind = p_kind and s.target_id = x.id and s.user_id = auth.uid()), false)
    from unnest(p_ids[1:200]) as x(id) $$;

-- My Saved Lives
create or replace function public.my_saved() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'at'), '[]'::jsonb) from (
    select jsonb_build_object('kind', 'show', 'id', s.id, 'title', s.title, 'title_i18n', s.title_i18n, 'at', s.scheduled_at, 'status', s.status,
                              'seller', j.name, 'seller_slug', j.slug, 'slug', s.slug, 'category', (s.categories)[1]) x
      from saved_lives sl join shows s on s.id = sl.target_id join jewelers j on j.id = s.jeweler_id
     where sl.user_id = auth.uid() and sl.kind = 'show' and s.visibility = 'public' and (s.status <> 'ended' or s.ended_at > now() - interval '7 days')
    union all
    select jsonb_build_object('kind', 'night', 'id', n.id, 'title', n.title, 'title_i18n', n.title_i18n, 'at', n.starts_at, 'status', 'scheduled', 'category', n.category)
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
     order by s.started_at desc nulls last limit 20;
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
    select t.*, p.lang, p.tz, p.unsub_token, u.email,
           case when now() >= t.at - interval '24 hours' and now() < t.at - interval '23 hours' then '24h'
                when now() >= t.at - interval '15 minutes' and now() < t.at - interval '4 minutes' then '15m' end slot
      from t join viewer_profiles p on p.user_id = t.user_id and p.reminders
             join auth.users u on u.id = t.user_id and u.email_confirmed_at is not null and coalesce(u.email, '') <> ''
     where t.at > now() and t.at < now() + interval '25 hours'
  loop
    continue when r.slot is null;
    insert into reminder_log (user_id, kind, target_id, slot, target_at) values (r.user_id, r.kind, r.target_id, r.slot, r.at) on conflict do nothing;
    continue when not found;
    v_title := coalesce(nullif(r.title_i18n ->> r.lang, ''), nullif(r.title_i18n ->> 'en', ''), r.title, '');
    v_url := case when r.kind = 'show' then v_base || '/' || r.js || '/?s=' || r.target_id || '&lang=' || r.lang
                  when _cat_page(r.cat) is not null then v_base || '/c/' || _cat_page(r.cat) || '/?lang=' || r.lang
                  else v_base || '/?lang=' || r.lang end;
    insert into outbox (template, lang, to_email, data)
      values ('reminder', r.lang, lower(r.email), jsonb_build_object('slot', r.slot, 'kind', r.kind, 'title', v_title, 'seller', coalesce(r.seller, ''),
              'at', to_char(r.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'tz', r.tz, 'url', v_url, 'off', v_base || '/me/?off=' || r.unsub_token || '&lang=' || r.lang))
      returning id into v_id;
    update reminder_log set outbox_id = v_id where user_id = r.user_id and kind = r.kind and target_id = r.target_id and slot = r.slot and target_at = r.at;
    v_n := v_n + 1;
  end loop;
  if v_n > 0 then perform _poke_mailer(); end if;
  return v_n;
end $$;

-- ============================================================ permessi
revoke all on function public._ref_code(), public._ensure_profile(uuid), public.growth_reminders(), public.referral_void(uuid, text) from public, anon, authenticated;
revoke all on function public.viewer_init(text, text, text, timestamptz, text, uuid, text), public.my_profile(), public.set_reminders(boolean),
  public.delete_my_account(), public.save_life(text, uuid, boolean), public.my_saved() from public, anon;
grant execute on function public.viewer_init(text, text, text, timestamptz, text, uuid, text), public.my_profile(), public.set_reminders(boolean),
  public.delete_my_account(), public.save_life(text, uuid, boolean), public.my_saved() to authenticated;
grant execute on function public.interested(text, uuid[]), public.reminders_off(text), public.record_share(text, uuid, text), public.record_visit(text, uuid, text),
  public.raid_targets(uuid, text), public.start_raid(uuid, text, uuid, integer), public.cancel_raid(uuid, text), public.set_accept_raids(uuid, text, boolean),
  public.raid_info(uuid), public.raid_event(uuid, text), public.raid_stats(uuid, text) to anon, authenticated;
-- «Iscriviti alla live» (follow_night) non è mai stata approvata: la sostituisce «Remind Me» (P1 #47 di Nikita)
revoke execute on function public.follow_night(text, uuid, text) from public, anon, authenticated;

-- ogni 5 minuti
select cron.schedule('crescita-promemoria', '*/5 * * * *', 'select public.growth_reminders()');
