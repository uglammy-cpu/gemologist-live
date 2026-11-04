-- UNIQAIA — dalla ruota all'abbonamento attivo (4 novembre 2026, dopo 2026-11-04_jewelers_wheel.sql)
--
-- Percorso: ruota → premio → registrazione (Supabase Auth) → candidatura → approvazione
--           → link di pagamento (Stripe Billing) → pagamento confermato dal webhook → abbonamento attivo.
--
-- Regole:
-- * 149 €/mese per brand approvato, 4 dirette al mese da 60 minuti al massimo, rinnovo mensile.
--   Nessun costo di attivazione. Lo sconto della ruota vale solo per il primo mese.
-- * Il premio si lega all'account (non si perde con logout, cambio dispositivo o compilazione del modulo).
-- * L'approvazione non attiva nulla: calcola sul server il primo mese e prepara il link di pagamento.
--   Senza Stripe collegato (BILLING_MODE = off) l'email resta ferma in coda come «blocked».
-- * Solo il pagamento confermato da Stripe attiva l'abbonamento, segna il premio come usato
--   e consegna al seller il link del suo pannello.
-- * Il modulo non si invia finché non sono pubblicate informativa privacy e condizioni.

-- ---------------------------------------------------------------- modello commerciale
insert into public.app_config (key, value) values
  ('PLAN_PRICE_CENTS', '14900'),
  ('PLAN_LIVES_PER_MONTH', '4'),
  ('PLAN_LIVE_MAX_MIN', '60'),
  ('BILLING_MODE', 'off')
on conflict (key) do nothing;

-- niente più costo di attivazione da 290 €
update public.wheel_config set setup_fee_cents = 0, updated_at = now() where id = 1;
alter table public.wheel_config alter column setup_fee_cents set default 0;

create or replace function public._plan(p_key text) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(public._cfg(p_key), '')::int, case p_key when 'PLAN_PRICE_CENTS' then 14900 when 'PLAN_LIVES_PER_MONTH' then 4 when 'PLAN_LIVE_MAX_MIN' then 60 end);
$$;
create or replace function public._billing_mode() returns text
language sql stable security definer set search_path = public as $$
  select case when public._cfg('BILLING_MODE') in ('test', 'live') then public._cfg('BILLING_MODE') else 'off' end;
$$;

-- ---------------------------------------------------------------- account dei seller
create table if not exists public.seller_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);
alter table public.applications add column if not exists user_id uuid references auth.users(id) on delete set null;
create unique index if not exists applications_one_per_account on public.applications (user_id) where user_id is not null;
alter table public.wheel_spins add column if not exists user_id uuid references auth.users(id) on delete set null;
create unique index if not exists wheel_spins_one_per_account on public.wheel_spins (user_id, mode) where user_id is not null and status <> 'void';

-- ---------------------------------------------------------------- abbonamenti
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  jeweler_id uuid not null unique references public.jewelers(id) on delete cascade,
  application_id uuid references public.applications(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  lang text not null default 'en',
  spin_id uuid references public.wheel_spins(id) on delete set null,
  prize_name text,
  first_month_cents int not null,
  standard_cents int not null,
  pay_token text not null unique,
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment', 'active', 'past_due', 'unpaid', 'canceled')),
  link_mail_id bigint references public.outbox(id) on delete set null,
  checkout_generation int not null default 0,
  checkout_session_id text,
  checkout_url text,
  checkout_expires_at timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  activated_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  last_payment_failed_at timestamptz,
  canceled_at timestamptz,
  activation_mail_id bigint references public.outbox(id) on delete set null,
  livemode boolean,                    -- prova o produzione: fissato quando si prepara il pagamento
  checkout_started_at timestamptz,     -- rende identica (idempotente) la pagina Stripe chiesta due volte insieme
  last_sub_event_at timestamptz,       -- ordine degli eventi Stripe sull'abbonamento
  constraint subscriptions_price check (first_month_cents > 0 and first_month_cents <= standard_cents)
);

-- registro degli eventi Stripe: ogni evento si applica una volta sola
create table if not exists public.billing_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now(),
  subscription_id uuid,
  result text,
  payload jsonb
);

alter table public.seller_accounts enable row level security;
alter table public.subscriptions enable row level security;
alter table public.billing_events enable row level security;
revoke all on public.seller_accounts, public.subscriptions, public.billing_events from anon, authenticated;

-- l'email con il link di pagamento resta ferma («blocked») finché Stripe non è collegato
do $$ declare c text; begin
  for c in select conname from pg_constraint where conrelid = 'public.outbox'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%status%' loop
    execute format('alter table public.outbox drop constraint %I', c);
  end loop;
end $$;
alter table public.outbox add constraint outbox_status_check check (status in ('queued', 'sending', 'held', 'sent', 'failed', 'cancelled', 'blocked'));
alter table public.outbox add column if not exists claimed_at timestamptz;
create unique index if not exists outbox_one_payment_mail on public.outbox (application_id) where template = 'approved_payment' and status <> 'cancelled';
create unique index if not exists outbox_one_activation_mail on public.outbox (application_id) where template = 'activated' and status <> 'cancelled';

-- il mailer prende in carico le email una volta sola anche se parte due volte insieme
create or replace function public.mailer_claim(p_limit int) returns setof public.outbox
language sql volatile security definer set search_path = public as $$
  update public.outbox set status = 'sending', claimed_at = now()
   where id in (select id from public.outbox
                 where status = 'queued' or (status = 'sending' and claimed_at < now() - interval '10 minutes')
                 order by created_at limit greatest(1, least(p_limit, 50)) for update skip locked)
  returning *;
$$;

-- ---------------------------------------------------------------- utilità
create or replace function public._account() returns public.seller_accounts
language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_email text; r public.seller_accounts;
begin
  if v_uid is null then raise exception 'Accedi al tuo account per continuare.'; end if;
  select lower(u.email) into v_email from auth.users u where u.id = v_uid;
  if v_email is null then raise exception 'Account non trovato.'; end if;
  insert into public.seller_accounts (user_id, email) values (v_uid, v_email)
  on conflict (user_id) do update set email = excluded.email
  returning * into r;
  return r;
end $$;

create or replace function public._legal_ready() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public._cfg('LEGAL_PRIVACY_URL'), '') ~ '^https://' and coalesce(public._cfg('LEGAL_TERMS_URL'), '') ~ '^https://';
$$;

-- testi legali e condizioni del piano, per la pagina pubblica
create or replace function public.site_terms() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'privacy_url', nullif(public._cfg('LEGAL_PRIVACY_URL'), ''),
    'terms_url', nullif(public._cfg('LEGAL_TERMS_URL'), ''),
    'legal_ready', public._legal_ready(),
    'price_cents', public._plan('PLAN_PRICE_CENTS'),
    'lives_per_month', public._plan('PLAN_LIVES_PER_MONTH'),
    'live_max_min', public._plan('PLAN_LIVE_MAX_MIN'));
$$;

-- ---------------------------------------------------------------- la ruota conosce l'account
create or replace function public.wheel_state(p_device uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c public.wheel_config; s public.wheel_spins; v_uid uuid := auth.uid();
begin
  select * into c from public.wheel_config where id = 1;
  if c.mode = 'off' then return jsonb_build_object('mode', 'off'); end if;
  -- chi ha un account vede il suo premio da qualunque dispositivo
  if v_uid is not null then
    select * into s from public.wheel_spins where user_id = v_uid and mode = c.mode and status <> 'void' order by created_at limit 1;
  end if;
  if s.id is null and p_device is not null then
    select * into s from public.wheel_spins where device = p_device and mode = c.mode;
  end if;
  return jsonb_build_object(
    'mode', c.mode,
    'standard_cents', public._plan('PLAN_PRICE_CENTS'),
    'lives_per_month', public._plan('PLAN_LIVES_PER_MONTH'),
    'live_max_min', public._plan('PLAN_LIVE_MAX_MIN'),
    'prizes', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'kind', kind, 'name', name, 'first_month_cents', first_month_cents) order by position)
                          from public.wheel_prizes where active), '[]'::jsonb),
    'spin', public._wheel_spin_json(s));
end $$;

-- lega il premio all'account, se l'account non ne ha già uno e la candidatura non è ancora decisa
create or replace function public._wheel_bind(p_spin uuid, p_uid uuid) returns public.wheel_spins
language plpgsql volatile security definer set search_path = public as $$
declare s public.wheel_spins; v_email text; v_status text;
begin
  select lower(email) into v_email from auth.users where id = p_uid;
  select status into v_status from public.applications where user_id = p_uid;
  if v_status in ('approved', 'rejected') then select * into s from public.wheel_spins where id = p_spin; return s; end if;
  update public.wheel_spins set user_id = p_uid, email = v_email, status = 'linked', linked_at = coalesce(linked_at, now()),
         vat_number = coalesce((select a.vat_number from public.applications a where a.user_id = p_uid), vat_number)
   where id = p_spin and user_id is null and status in ('provisional', 'linked')
     and not exists (select 1 from public.wheel_spins x where x.user_id = p_uid and x.mode = wheel_spins.mode and x.status <> 'void')
  returning * into s;
  if s.id is null then select * into s from public.wheel_spins where id = p_spin; end if;
  return s;
end $$;

create or replace function public.wheel_spin(p_device uuid, p_session uuid, p_lang text) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare c public.wheel_config; s public.wheel_spins; prev public.wheel_spins; p public.wheel_prizes;
        v_ip text := public._wheel_ip_hash(); v_total bigint; v_r bigint; v_code text; v_uid uuid := auth.uid();
begin
  if p_device is null then raise exception 'Dispositivo mancante'; end if;
  select * into c from public.wheel_config where id = 1;
  if c.mode = 'off' then raise exception 'Promozione non attiva'; end if;

  -- un solo giro valido per account e per dispositivo: chi ha già giocato rivede il suo premio
  if v_uid is not null then
    select * into s from public.wheel_spins where user_id = v_uid and mode = c.mode and status <> 'void' order by created_at limit 1;
    if s.id is not null then return public._wheel_spin_json(s) || jsonb_build_object('existing', true); end if;
  end if;
  select * into s from public.wheel_spins where device = p_device and mode = c.mode;
  if s.id is not null then return public._wheel_spin_json(s) || jsonb_build_object('existing', true); end if;

  if v_ip is not null and (select count(*) from public.wheel_spins where ip_hash = v_ip and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Troppi tentativi, riprova più tardi';
  end if;

  if c.mode = 'live' then
    if cardinality(public._wheel_live_problems()) > 0 then raise exception 'Promozione non disponibile'; end if;
    if v_ip is not null and c.ip_window_hours > 0 then
      select * into prev from public.wheel_spins
       where ip_hash = v_ip and mode = 'live' and created_at > now() - make_interval(hours => c.ip_window_hours)
       order by created_at limit 1;
    end if;
    if prev.id is not null then
      select * into p from public.wheel_prizes where code = prev.prize_code and active and deliverable and weight > 0;
    end if;
    if p.code is null then
      prev := null;
      select sum(weight) into v_total from public.wheel_prizes where active and deliverable and weight > 0;
      v_r := public._wheel_rand(v_total);
      select x.code into v_code from (
        select code, sum(weight) over (order by position, code) as cum from public.wheel_prizes where active and deliverable and weight > 0
      ) x where x.cum > v_r order by x.cum limit 1;
      select * into p from public.wheel_prizes where code = v_code;
    end if;
  else
    select count(*) into v_total from public.wheel_prizes where active;
    v_r := public._wheel_rand(v_total);
    select * into p from public.wheel_prizes where active order by position, code offset v_r limit 1;
  end if;
  if p.code is null then raise exception 'Promozione non disponibile'; end if;

  insert into public.wheel_spins (device, mode, prize_code, prize_name, prize_kind, first_month_cents, ip_hash, lang, repeat_of)
  values (p_device, c.mode, p.code, p.name, p.kind, p.first_month_cents, v_ip, left(coalesce(p_lang, ''), 5), prev.id)
  returning * into s;
  if v_uid is not null then s := public._wheel_bind(s.id, v_uid); end if;
  return public._wheel_spin_json(s) || jsonb_build_object('existing', false);
end $$;

-- dopo la registrazione o l'accesso: il premio giocato da questo dispositivo passa all'account
create or replace function public.account_claim_spin(p_device uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare acc public.seller_accounts := public._account(); c public.wheel_config; s public.wheel_spins;
begin
  select * into c from public.wheel_config where id = 1;
  if c.mode = 'off' then return null; end if;
  select * into s from public.wheel_spins where user_id = acc.user_id and mode = c.mode and status <> 'void' order by created_at limit 1;
  if s.id is null and p_device is not null then
    select * into s from public.wheel_spins where device = p_device and mode = c.mode and user_id is null;
    if s.id is not null then s := public._wheel_bind(s.id, acc.user_id); end if;
    if s.user_id is distinct from acc.user_id then s := null; end if;
  end if;
  return public._wheel_spin_json(s);
end $$;

-- ---------------------------------------------------------------- area del seller
create or replace function public.account_me() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare acc public.seller_accounts := public._account(); a public.applications; s public.wheel_spins; sub public.subscriptions;
        v_key text; v_slug text; v_mode text := public._billing_mode();
begin
  select * into a from public.applications where user_id = acc.user_id;
  select * into s from public.wheel_spins where user_id = acc.user_id and status <> 'void' order by (mode = 'live') desc, created_at limit 1;
  if a.jeweler_id is not null then select * into sub from public.subscriptions where jeweler_id = a.jeweler_id; end if;
  -- un pagamento fatto in prova (carta di prova della gemmologa) non vale per il seller: per lui resta da pagare
  if sub.id is not null and sub.livemode = false and sub.status <> 'awaiting_payment' then
    sub.status := 'awaiting_payment'; sub.activated_at := null; sub.current_period_end := null;
  end if;
  if sub.status in ('active', 'past_due') then
    select t.token into v_key from public.staff_tokens t where t.jeweler_id = a.jeweler_id and t.role = 'jeweler' limit 1;
    select j.slug into v_slug from public.jewelers j where j.id = a.jeweler_id;
  end if;
  return jsonb_build_object(
    'email', acc.email,
    'spin', public._wheel_spin_json(s),
    'application', case when a.id is null then null else jsonb_build_object(
        'id', a.id, 'status', a.status, 'name', a.name, 'submitted_at', a.submitted_at, 'decided_at', a.decided_at,
        'info_request', case when a.status = 'needs_info' then a.info_request end,
        'fields', case when a.status = 'needs_info' then jsonb_build_object(
          'name', a.name, 'legal_name', a.legal_name, 'vat_number', a.vat_number, 'contact_name', a.contact_name, 'phone', a.phone,
          'country', a.country, 'city', a.city, 'site', a.site, 'instagram', a.instagram, 'kind', a.kind, 'categories', to_jsonb(a.categories),
          'description', a.description, 'show_what', a.show_what, 'night_id', a.night_id,
          'has_logo', a.logo_path is not null, 'has_photos', coalesce(array_length(a.photo_paths, 1), 0) = 2) end) end,
    'subscription', case when sub.id is null then null else jsonb_build_object(
        'status', sub.status, 'first_month_cents', sub.first_month_cents, 'standard_cents', sub.standard_cents, 'prize_name', sub.prize_name,
        'pay_token', case when sub.status = 'awaiting_payment' and v_mode = 'live' then sub.pay_token end,
        'billing_ready', v_mode = 'live', 'activated_at', sub.activated_at, 'current_period_end', sub.current_period_end) end,
    'panel', case when v_key is not null then jsonb_build_object('slug', v_slug, 'key', v_key) end,
    'plan', jsonb_build_object('price_cents', public._plan('PLAN_PRICE_CENTS'), 'lives_per_month', public._plan('PLAN_LIVES_PER_MONTH'), 'live_max_min', public._plan('PLAN_LIVE_MAX_MIN')));
end $$;

-- candidatura dall'account: riusa submit_application (controlli, consensi, file, email di conferma)
create or replace function public.account_submit_application(p jsonb) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare acc public.seller_accounts := public._account(); a public.applications; v_id uuid; q jsonb;
        v_tok text := nullif(regexp_replace(coalesce(p->>'token', ''), '[^a-f0-9]', '', 'g'), '');
begin
  if not public._legal_ready() then raise exception 'Il modulo si attiva quando sono pubblicate informativa privacy e condizioni.'; end if;
  select * into a from public.applications where user_id = acc.user_id;
  if a.id is null and v_tok is not null then
    -- candidatura proposta dalla gemmologa o con integrazioni richieste, aperta dal link personale
    select * into a from public.applications where invite_token = v_tok and status in ('invited', 'needs_info') and (user_id is null or user_id = acc.user_id);
    if a.id is null then raise exception 'Link non valido o già usato.'; end if;
  end if;
  if a.id is not null and a.status not in ('invited', 'needs_info') then raise exception 'La candidatura è già stata inviata.'; end if;
  -- l'email è quella dell'account: lì arriveranno l'esito e il link di pagamento
  q := (p - 'token' - 'email') || jsonb_build_object('email', acc.email);
  if a.id is not null then q := q || jsonb_build_object('token', a.invite_token); end if;
  v_id := public.submit_application(q);
  update public.applications set user_id = acc.user_id where id = v_id;
  update public.wheel_spins w set email = acc.email, vat_number = coalesce((select x.vat_number from public.applications x where x.id = v_id), w.vat_number),
         status = 'linked', linked_at = coalesce(linked_at, now())
   where w.user_id = acc.user_id and w.status in ('provisional', 'linked');
  -- la conferma di ricezione parla dell'offerta solo a chi ne ha una vera
  update public.outbox o set data = o.data || jsonb_build_object('offer', exists (
           select 1 from public.wheel_spins w where w.user_id = acc.user_id and w.mode = 'live' and w.status = 'linked'))
   where o.application_id = v_id and o.template = 'received' and o.status = 'queued';
  return v_id;
end $$;

-- ---------------------------------------------------------------- conferma del premio all'approvazione (anche via account)
-- chiave di confronto della partita IVA: solo lettere e cifre, senza il prefisso del paese
create or replace function public._vat_key(p text) returns text
language sql immutable as $$
  select nullif(regexp_replace(upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')), '^[A-Z]{2}(?=[0-9])', ''), '');
$$;

create or replace function public._wheel_on_application() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare s public.wheel_spins; v_vat text; v_key text; v_email text;
begin
  if new.status is not distinct from old.status or new.status <> 'approved' then return new; end if;
  begin
    v_vat := nullif(upper(regexp_replace(coalesce(new.vat_number, ''), '\s', '', 'g')), '');
    v_key := public._vat_key(new.vat_number);
    v_email := lower(new.email);
    -- solo i premi di chi ha presentato la candidatura: il suo account, oppure (candidature senza account) la sua email
    for s in
      select * from public.wheel_spins
       where status = 'linked'
         and ((new.user_id is not null and user_id = new.user_id) or (new.user_id is null and user_id is null and email = v_email))
       order by created_at
    loop
      -- un solo premio per gioielliere: stessa email, stessa partita IVA della candidatura, stesso account o stesso venditore
      if exists (select 1 from public.wheel_spins x
                  where x.status in ('confirmed', 'redeemed') and x.mode = s.mode
                    and (x.email = v_email or (v_key is not null and public._vat_key(x.vat_number) = v_key)
                         or (new.jeweler_id is not null and x.jeweler_id = new.jeweler_id)
                         or (new.user_id is not null and x.user_id = new.user_id))) then
        update public.wheel_spins set status = 'void', void_reason = 'Un premio è già stato assegnato a questo gioielliere' where id = s.id;
      elsif exists (select 1 from public.seller_private sp where lower(sp.email) = v_email and sp.jeweler_id is distinct from new.jeweler_id)
         or exists (select 1 from public.jewelers j where j.id is distinct from new.jeweler_id
                      and (lower(j.contact_email) = v_email or (v_key is not null and public._vat_key(j.vat_number) = v_key))) then
        update public.wheel_spins set status = 'void', void_reason = 'Già venditore della piattaforma' where id = s.id;
      else
        update public.wheel_spins set status = 'confirmed', confirmed_at = now(), application_id = new.id, jeweler_id = new.jeweler_id,
               email = v_email, vat_number = coalesce(v_vat, vat_number),
               promo_code = case when s.mode = 'live' then 'UQ-' else 'DEMO-' end || upper(encode(gen_random_bytes(4), 'hex')),
               delivery_status = case when s.prize_kind = 'perk' then 'pending' else 'n/a' end
         where id = s.id;
      end if;
    end loop;
  exception when others then
    raise warning 'wheel: %', sqlerrm;
  end;
  return new;
end $$;

-- ---------------------------------------------------------------- approvazione → link di pagamento
create or replace function public._billing_open(p_jeweler uuid, p_app uuid) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare a public.applications; s public.wheel_spins; sub public.subscriptions; v_std int := public._plan('PLAN_PRICE_CENTS');
        v_first int := public._plan('PLAN_PRICE_CENTS'); v_mail bigint; v_mode text := public._billing_mode();
begin
  select * into a from public.applications where id = p_app;
  -- solo un premio vero (ruota pubblica) e confermato riduce il primo mese; quelli demo no
  select * into s from public.wheel_spins where application_id = p_app and status = 'confirmed' and mode = 'live' and prize_kind = 'discount' order by confirmed_at limit 1;
  if s.id is null then
    select * into s from public.wheel_spins where application_id = p_app and status = 'confirmed' and mode = 'live' order by confirmed_at limit 1;
  end if;
  if s.id is not null and s.prize_kind = 'discount' then v_first := least(s.first_month_cents, v_std); end if;
  insert into public.subscriptions (jeweler_id, application_id, user_id, email, lang, spin_id, prize_name, first_month_cents, standard_cents, pay_token)
  values (p_jeweler, p_app, a.user_id, lower(a.email), a.lang, s.id, s.prize_name, v_first, v_std, encode(gen_random_bytes(24), 'hex'))
  on conflict (jeweler_id) do nothing
  returning * into sub;
  if sub.id is null then return; end if;  -- già avviato: nessuna seconda email
  insert into public.outbox (template, lang, to_email, data, application_id, status)
  values ('approved_payment', a.lang, lower(a.email),
          jsonb_build_object('brand', a.name, 'contact', a.contact_name, 'first_cents', v_first, 'std_cents', v_std,
                             'lives', public._plan('PLAN_LIVES_PER_MONTH'), 'max_min', public._plan('PLAN_LIVE_MAX_MIN'),
                             'offer', v_first < v_std, 'prize', s.prize_name, 'pay_token', sub.pay_token),
          p_app, case when v_mode = 'live' then 'queued' else 'blocked' end)
  on conflict do nothing
  returning id into v_mail;
  update public.subscriptions set link_mail_id = v_mail where id = sub.id;
  if v_mode = 'live' then perform public._poke_mailer(); end if;
end $$;

create or replace function public.approve_application(p_token text, p_id uuid, p_slug text)
returns table(jeweler_id uuid, staff_token text)
language plpgsql security definer set search_path = public, extensions as $$
declare a public.applications; v_j uuid; v_t text; v_slug text := lower(trim(coalesce(p_slug, '')));
begin
  if not public.is_gemologist(p_token) then raise exception 'Token non valido'; end if;
  select * into a from public.applications where id = p_id;
  if a.id is null then raise exception 'Candidatura non trovata'; end if;
  if a.status = 'approved' and a.jeweler_id is not null then
    select t.jeweler_id, t.token into v_j, v_t from public.staff_tokens t where t.jeweler_id = a.jeweler_id and t.role = 'jeweler' limit 1;
    return query select v_j, v_t; return;
  end if;
  if a.status <> 'new' then raise exception 'Si approvano solo le candidature complete, in attesa di approvazione'; end if;
  if v_slug !~ '^[a-z0-9-]{2,40}$' or v_slug in ('join','admin','api','token','panel','vetrina','live','www','app','static','img','it','en','fr','ru','ar','demo','pay','wheel-admin','account','privacy','condizioni','terms') then
    raise exception 'Indirizzo non valido';
  end if;
  if exists (select 1 from public.jewelers where slug = v_slug) then raise exception 'Indirizzo gia'' usato da un altro venditore'; end if;

  insert into public.jewelers (slug, name, city, kind, languages, is_public, country, website, categories, legal_name, vat_number,
    instagram, description, logo_path, photo_paths, application_id)
  values (v_slug, a.name, a.city, a.kind, '{it,en,fr}', false, coalesce(a.country, 'IT'), nullif(a.site, ''), coalesce(a.categories, '{}'),
    a.legal_name, a.vat_number, a.instagram, a.description, a.logo_path, coalesce(a.photo_paths, '{}'), a.id)
  returning id into v_j;
  insert into public.seller_private (jeweler_id, contact_name, email, phone, application_id) values (v_j, a.contact_name, a.email, a.phone, a.id);
  v_t := encode(gen_random_bytes(12), 'hex');
  insert into public.staff_tokens (token, role, jeweler_id, display_name) values (v_t, 'jeweler', v_j, a.name);
  update public.applications set status = 'approved', jeweler_id = v_j, decided_at = now(), updated_at = now() where id = p_id;
  -- l'approvazione avvia il pagamento; il pannello arriva solo dopo il pagamento confermato
  perform public._billing_open(v_j, p_id);
  return query select v_j, v_t;
end $$;

-- ---------------------------------------------------------------- Stripe (chiamate solo dalle edge function, con la chiave di servizio)
create or replace function public.billing_checkout_start(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare sub public.subscriptions; j public.jewelers; v_mode text := public._billing_mode(); v_live boolean; v_prev text;
begin
  if v_mode = 'off' then return jsonb_build_object('state', 'disabled'); end if;
  select * into sub from public.subscriptions where pay_token = nullif(regexp_replace(coalesce(p_token, ''), '[^a-f0-9]', '', 'g'), '') for update;
  if sub.id is null then return jsonb_build_object('state', 'invalid'); end if;
  if sub.status in ('active', 'past_due') then return jsonb_build_object('state', 'active'); end if;
  if sub.status in ('canceled', 'unpaid') then return jsonb_build_object('state', 'closed'); end if;
  v_live := v_mode = 'live';
  -- passaggio da prova a produzione: niente di quanto preparato in prova vale più (cliente, pagina, chiave)
  -- un link di produzione aperto mentre i pagamenti sono in prova: non si tocca (la pagina vera resta valida su Stripe)
  if sub.livemode and not v_live then return jsonb_build_object('state', 'disabled'); end if;
  if sub.livemode is null then
    update public.subscriptions set livemode = v_live where id = sub.id returning * into sub;
  elsif sub.livemode <> v_live then
    update public.subscriptions set livemode = v_live, stripe_customer_id = null, checkout_session_id = null, checkout_url = null,
           checkout_expires_at = null, checkout_started_at = null, checkout_generation = checkout_generation + 1, updated_at = now()
     where id = sub.id returning * into sub;
  end if;
  -- una sola pagina di pagamento aperta per volta: due clic non creano due abbonamenti
  if sub.checkout_session_id is not null and sub.checkout_expires_at > now() + interval '10 minutes' then
    return jsonb_build_object('state', 'open', 'url', sub.checkout_url);
  end if;
  if sub.checkout_session_id is not null or sub.checkout_started_at < now() - interval '22 hours' then
    v_prev := sub.checkout_session_id;   -- la vecchia pagina va chiusa su Stripe
    update public.subscriptions set checkout_generation = checkout_generation + 1, checkout_session_id = null, checkout_url = null,
           checkout_expires_at = null, checkout_started_at = now(), updated_at = now()
     where id = sub.id returning * into sub;
  elsif sub.checkout_started_at is null then
    update public.subscriptions set checkout_started_at = now() where id = sub.id returning * into sub;
  end if;
  select * into j from public.jewelers where id = sub.jeweler_id;
  return jsonb_build_object('state', 'create', 'mode', v_mode, 'subscription_id', sub.id, 'generation', sub.checkout_generation,
    'jeweler_id', sub.jeweler_id, 'brand', j.name, 'email', sub.email, 'customer', sub.stripe_customer_id, 'lang', sub.lang,
    'first_month_cents', sub.first_month_cents, 'standard_cents', sub.standard_cents, 'discount_cents', sub.standard_cents - sub.first_month_cents,
    'pay_token', sub.pay_token, 'expires_at', extract(epoch from sub.checkout_started_at + interval '23 hours')::bigint, 'previous_session', v_prev);
end $$;

create or replace function public.billing_checkout_saved(p_sub uuid, p_generation int, p_session text, p_url text, p_expires timestamptz, p_customer text) returns void
language sql volatile security definer set search_path = public as $$
  update public.subscriptions set checkout_session_id = p_session, checkout_url = p_url, checkout_expires_at = p_expires,
         stripe_customer_id = coalesce(p_customer, stripe_customer_id), updated_at = now()
   where id = p_sub and checkout_generation = p_generation and status = 'awaiting_payment';
$$;

create or replace function public._billing_activate(p_sub uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare sub public.subscriptions; j public.jewelers; v_key text; v_mail bigint;
begin
  update public.subscriptions set status = 'active', activated_at = now(), updated_at = now()
   where id = p_sub and activated_at is null returning * into sub;
  if sub.id is null then
    update public.subscriptions set status = 'active', updated_at = now() where id = p_sub and status <> 'canceled';
    return;
  end if;
  -- il premio della ruota risulta usato
  update public.wheel_spins set status = 'redeemed', redeemed_at = now(), subscription_ref = coalesce(sub.stripe_subscription_id, sub.id::text)
   where id = sub.spin_id and status in ('confirmed', 'redeemed');
  if sub.livemode then
    update public.outbox set status = 'cancelled' where template = 'activated' and application_id = sub.application_id and status = 'blocked';
  end if;
  -- il seller riceve il link del suo pannello (un pagamento di prova non scrive al seller: l'email resta ferma)
  select * into j from public.jewelers where id = sub.jeweler_id;
  select t.token into v_key from public.staff_tokens t where t.jeweler_id = sub.jeweler_id and t.role = 'jeweler' limit 1;
  insert into public.outbox (template, lang, to_email, data, application_id, status)
  values ('activated', sub.lang, sub.email, jsonb_build_object('brand', j.name, 'slug', j.slug, 'key', v_key,
          'std_cents', sub.standard_cents, 'lives', public._plan('PLAN_LIVES_PER_MONTH'), 'max_min', public._plan('PLAN_LIVE_MAX_MIN')), sub.application_id,
          case when sub.livemode then 'queued' else 'blocked' end)
  on conflict do nothing returning id into v_mail;
  update public.subscriptions set activation_mail_id = v_mail where id = sub.id;
  perform public._poke_mailer();
end $$;

create or replace function public._ts(p jsonb) returns timestamptz
language sql immutable as $$ select case when p is null or p = 'null'::jsonb then null else to_timestamp((p #>> '{}')::bigint) end $$;

-- applica un evento Stripe già verificato dalla edge function; idempotente
create or replace function public.billing_apply_event(p_event jsonb) returns text
language plpgsql volatile security definer set search_path = public as $$
declare v_id text := p_event->>'id'; v_type text := p_event->>'type'; o jsonb := p_event->'data'->'object';
        sub public.subscriptions; v_sub uuid; v_stripe_sub text; r text := 'ignored'; v_line jsonb; v_status text;
        v_live boolean := coalesce((p_event->>'livemode')::boolean, false);
        v_created timestamptz := coalesce(to_timestamp(nullif(p_event->>'created', '')::bigint), now());
begin
  if v_id is null or v_type is null then raise exception 'Evento non valido'; end if;
  insert into public.billing_events (id, type, payload) values (v_id, v_type, p_event) on conflict (id) do nothing;
  if not found then return 'duplicate_event'; end if;

  v_stripe_sub := case when v_type like 'customer.subscription.%' then o->>'id'
                       else coalesce(o->>'subscription', o#>>'{parent,subscription_details,subscription}') end;
  begin
    v_sub := nullif(coalesce(o#>>'{metadata,uniqaia_subscription}', o#>>'{subscription_details,metadata,uniqaia_subscription}',
                             o#>>'{parent,subscription_details,metadata,uniqaia_subscription}'), '')::uuid;
  exception when others then v_sub := null; end;
  if v_sub is not null then select * into sub from public.subscriptions where id = v_sub for update; end if;
  if sub.id is null and v_stripe_sub is not null then select * into sub from public.subscriptions where stripe_subscription_id = v_stripe_sub for update; end if;
  if sub.id is null then update public.billing_events set result = 'no_match' where id = v_id; return 'no_match'; end if;

  -- un evento di prova non tocca un abbonamento di produzione e viceversa;
  -- un pagamento vero arrivato su un abbonamento non di produzione va annullato e rimborsato (come un doppione)
  if sub.livemode is distinct from v_live then
    r := case when v_live and v_stripe_sub is not null
                   and (v_type in ('invoice.paid', 'invoice.payment_succeeded') or (v_type = 'checkout.session.completed' and o->>'payment_status' = 'paid'))
              then 'duplicate:' || v_stripe_sub else 'mode_mismatch' end;

  elsif v_type = 'checkout.session.completed' then
    -- il pagamento deve appartenere al seller giusto
    if (o->>'client_reference_id') is distinct from sub.jeweler_id::text then r := 'mismatch';
    elsif sub.stripe_subscription_id is not null and sub.stripe_subscription_id <> coalesce(v_stripe_sub, '') then r := 'duplicate:' || coalesce(v_stripe_sub, '');
    else
      update public.subscriptions set stripe_customer_id = coalesce(o->>'customer', stripe_customer_id), stripe_subscription_id = coalesce(v_stripe_sub, stripe_subscription_id),
             checkout_session_id = o->>'id', updated_at = now() where id = sub.id;
      if o->>'payment_status' = 'paid' then perform public._billing_activate(sub.id); r := 'activated'; else r := 'checkout_completed_unpaid'; end if;
    end if;

  -- da qui in poi contano solo gli eventi dell'abbonamento Stripe di questo seller
  elsif sub.stripe_subscription_id is not null and v_stripe_sub is distinct from sub.stripe_subscription_id then
    r := case when v_type in ('invoice.paid', 'invoice.payment_succeeded') and v_stripe_sub is not null then 'duplicate:' || v_stripe_sub else 'other_subscription' end;

  elsif v_type in ('invoice.paid', 'invoice.payment_succeeded') then
    if sub.status = 'canceled' then r := 'after_cancel';
    -- dopo l'attivazione conta l'ordine: una fattura vecchia arrivata tardi non riattiva un abbonamento sospeso
    elsif sub.activated_at is not null and sub.last_sub_event_at is not null and v_created < sub.last_sub_event_at then r := 'stale';
    else
      v_line := o#>'{lines,data,0,period}';
      update public.subscriptions set stripe_subscription_id = coalesce(stripe_subscription_id, v_stripe_sub), stripe_customer_id = coalesce(stripe_customer_id, o->>'customer'),
             current_period_start = greatest(current_period_start, public._ts(v_line->'start')), current_period_end = greatest(current_period_end, public._ts(v_line->'end')),
             last_sub_event_at = greatest(last_sub_event_at, v_created), updated_at = now() where id = sub.id;
      perform public._billing_activate(sub.id); r := 'paid';
    end if;

  elsif v_type = 'invoice.payment_failed' then
    if sub.last_sub_event_at is not null and v_created < sub.last_sub_event_at then r := 'stale';   -- tentativo fallito vecchio, poi pagato
    else
      update public.subscriptions set last_payment_failed_at = now(), status = case when status = 'active' then 'past_due' else status end,
             last_sub_event_at = greatest(last_sub_event_at, v_created), updated_at = now() where id = sub.id;
      r := 'payment_failed';
    end if;

  elsif v_type in ('customer.subscription.updated', 'customer.subscription.deleted') then
    if sub.status = 'canceled' then r := 'after_cancel';                                    -- una disdetta è definitiva
    elsif sub.last_sub_event_at is not null and v_created < sub.last_sub_event_at then r := 'stale';   -- evento arrivato in ritardo
    elsif v_type = 'customer.subscription.deleted' then
      update public.subscriptions set status = 'canceled', canceled_at = now(), last_sub_event_at = v_created, updated_at = now() where id = sub.id;
      r := 'canceled';
    else
      v_status := o->>'status';
      update public.subscriptions set
        status = case when activated_at is null then status  -- si attiva solo con un pagamento confermato
                      when v_status in ('active', 'trialing') then 'active' when v_status = 'past_due' then 'past_due'
                      when v_status = 'unpaid' then 'unpaid' when v_status = 'canceled' then 'canceled' else status end,
        canceled_at = case when v_status = 'canceled' and activated_at is not null then now() else canceled_at end,
        current_period_start = greatest(current_period_start, public._ts(coalesce(o->'current_period_start', o#>'{items,data,0,current_period_start}'))),
        current_period_end = greatest(current_period_end, public._ts(coalesce(o->'current_period_end', o#>'{items,data,0,current_period_end}'))),
        last_sub_event_at = v_created, updated_at = now() where id = sub.id;
      r := 'updated:' || coalesce(v_status, '');
    end if;
  end if;

  update public.billing_events set result = r, subscription_id = sub.id where id = v_id;
  return r;
end $$;

create or replace function public.billing_mode_get() returns text
language sql stable security definer set search_path = public as $$ select public._billing_mode() $$;
create or replace function public.billing_event_note(p_id text, p_note text) returns void
language sql volatile security definer set search_path = public as $$ update public.billing_events set result = left(p_note, 300) where id = p_id $$;

-- ---------------------------------------------------------------- 4 dirette al mese di abbonamento, 60 minuti ciascuna
-- Mese di abbonamento = dalla data di attivazione allo stesso giorno del mese dopo (come la fatturazione Stripe, in UTC).
-- Vale per i seller con abbonamento; la gemmologa e i venditori senza abbonamento restano come prima.
-- Due controlli: quando si programma o si sposta una diretta (al massimo 4 in calendario per mese)
-- e quando si va in onda (al massimo 4 dirette andate in onda per mese, contate dall'ora d'inizio).

-- inizio e fine del mese di abbonamento che contiene p_at
create or replace function public._sub_period(p_anchor timestamptz, p_at timestamptz, out p_start timestamptz, out p_end timestamptz)
language plpgsql immutable set timezone = 'UTC' as $$
declare v_n int;
begin
  v_n := greatest(0, (extract(year from age(p_at, p_anchor)) * 12 + extract(month from age(p_at, p_anchor)))::int - 1);
  while v_n > 0 and p_anchor + make_interval(months => v_n) > p_at loop v_n := v_n - 1; end loop;
  while p_anchor + make_interval(months => v_n + 1) <= p_at loop v_n := v_n + 1; end loop;
  p_start := p_anchor + make_interval(months => v_n);
  p_end := p_anchor + make_interval(months => v_n + 1);
end $$;

create or replace function public._quota_msg(p_start timestamptz, p_end timestamptz, p_what text) returns text
language sql immutable as $$
  select format('Nel mese di abbonamento dal %s al %s hai già %s le %s dirette comprese.',
    to_char(p_start at time zone 'Europe/Rome', 'DD/MM'), to_char((p_end - interval '1 day') at time zone 'Europe/Rome', 'DD/MM'), p_what, public._plan('PLAN_LIVES_PER_MONTH'));
$$;

-- programmare o spostare una diretta (p_exclude = la diretta che si sposta)
create or replace function public._show_quota(p_jeweler uuid, p_at timestamptz, p_exclude uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare sub public.subscriptions; p record; v_cnt int;
begin
  select * into sub from public.subscriptions where jeweler_id = p_jeweler for update;   -- un controllo alla volta per seller
  if sub.id is null then return; end if;
  if sub.status <> 'active' then raise exception 'Per programmare le dirette serve l''abbonamento attivo.'; end if;
  if p_at is null or not isfinite(p_at) then raise exception 'Data non valida.'; end if;
  if p_at < sub.activated_at then raise exception 'La data è precedente all''attivazione dell''abbonamento.'; end if;
  if p_at < now() - interval '1 hour' then raise exception 'Non si può programmare una diretta nel passato.'; end if;
  if p_exclude is not null and exists (select 1 from public.shows where id = p_exclude and status <> 'scheduled') then
    raise exception 'Si possono spostare solo le dirette non ancora iniziate.';
  end if;
  select * into p from public._sub_period(sub.activated_at, p_at);
  -- spostare una diretta dentro lo stesso mese non aumenta il conteggio
  if p_exclude is not null and exists (select 1 from public.shows where id = p_exclude and scheduled_at >= p.p_start and scheduled_at < p.p_end) then return; end if;
  select count(*) into v_cnt from public.shows
   where jeweler_id = p_jeweler and id is distinct from p_exclude and scheduled_at >= p.p_start and scheduled_at < p.p_end;
  if v_cnt >= public._plan('PLAN_LIVES_PER_MONTH') then raise exception '%', public._quota_msg(p.p_start, p.p_end, 'programmato'); end if;
end $$;

-- andare in onda: conta le dirette davvero iniziate nel mese di abbonamento in corso
create or replace function public._live_quota(p_show uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare sh public.shows; sub public.subscriptions; p record; v_cnt int;
begin
  select * into sh from public.shows where id = p_show;
  select * into sub from public.subscriptions where jeweler_id = sh.jeweler_id for update;
  if sub.id is null then return; end if;
  if sub.status <> 'active' then raise exception 'Per andare in diretta serve l''abbonamento attivo.'; end if;
  if sh.status = 'live' then return; end if;
  -- una diretta conclusa non si riapre: per un'altra diretta se ne programma una nuova
  if sh.ended_at is not null then raise exception 'Questa diretta è conclusa: per andare di nuovo in onda programmane una nuova.'; end if;
  select * into p from public._sub_period(sub.activated_at, now());
  select count(*) into v_cnt from public.shows
   where jeweler_id = sh.jeweler_id and id <> p_show and started_at >= p.p_start and started_at < p.p_end;
  if v_cnt >= public._plan('PLAN_LIVES_PER_MONTH') then raise exception '%', public._quota_msg(p.p_start, p.p_end, 'fatto'); end if;
end $$;

create or replace function public.create_show(p_token text, p_jeweler uuid, p_title text, p_at timestamptz, p_lang text, p_slots jsonb)
returns public.shows
language plpgsql security definer set search_path = public as $$
declare v_role text; v_row public.shows; v_at timestamptz := coalesce(p_at, now()); v_sub boolean;
begin
  select role into v_role from public.staff_jeweler(p_token, p_jeweler);
  if v_role is null then raise exception 'Token non valido'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Titolo mancante'; end if;
  v_sub := exists (select 1 from public.subscriptions where jeweler_id = p_jeweler);
  if v_role = 'jeweler' then perform public._show_quota(p_jeweler, v_at, null); end if;
  insert into public.shows (jeweler_id, title, scheduled_at, lang, slots, duration_min)
  values (p_jeweler, left(trim(p_title), 120), v_at, coalesce(nullif(p_lang, ''), 'it'), coalesce(p_slots, '[]'::jsonb),
          case when v_sub then public._plan('PLAN_LIVE_MAX_MIN') end)
  returning * into v_row;
  return v_row;
end $$;

-- spostare la data di una diretta non deve aggirare il limite (il seller sì, la gemmologa no);
-- se la data non cambia (titolo, lingua, pezzi) nessun controllo
create or replace function public.update_show(p_show uuid, p_token text, p_title text, p_at timestamptz, p_lang text, p_slots jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_role text; sh public.shows;
begin
  select role into v_role from staff_check(p_token, p_show);
  if v_role is null then raise exception 'Token non valido'; end if;
  select * into sh from public.shows where id = p_show;
  if v_role = 'jeweler' and p_at is not null and p_at is distinct from sh.scheduled_at then
    perform public._show_quota(sh.jeweler_id, p_at, p_show);
  end if;
  update shows set
    title = coalesce(nullif(left(trim(p_title), 120), ''), title),
    scheduled_at = coalesce(p_at, scheduled_at),
    lang = coalesce(nullif(p_lang, ''), lang),
    slots = coalesce(p_slots, slots)
  where id = p_show;
end $$;

create or replace function public.update_show2(p_show uuid, p_token text, p_title text, p_at timestamptz, p_lang text, p_slots jsonb, p_i18n jsonb, p_vis text)
returns void language plpgsql security definer set search_path = public as $$
declare v_role text; sh public.shows;
begin
  select role into v_role from staff_check(p_token, p_show);
  if v_role is null then raise exception 'Token non valido'; end if;
  select * into sh from public.shows where id = p_show;
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
end $$;

-- in onda / conclusa: per i seller con abbonamento conta le dirette fatte nel mese (la gemmologa non ha limiti)
create or replace function public.set_show_status(p_show uuid, p_token text, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v_role text;
begin
  select role into v_role from staff_check(p_token, p_show);
  if v_role is null then raise exception 'Token non valido'; end if;
  if v_role = 'jeweler' and p_status in ('live', 'scheduled') then
    if exists (select 1 from public.shows s join public.subscriptions b on b.jeweler_id = s.jeweler_id where s.id = p_show) then
      if p_status = 'live' then perform public._live_quota(p_show);
      elsif exists (select 1 from public.shows where id = p_show and ended_at is not null) then
        raise exception 'Questa diretta è conclusa: per andare di nuovo in onda programmane una nuova.';
      end if;
    end if;
  end if;
  update shows set status = p_status,
    started_at = case when p_status = 'live' then coalesce(started_at, now()) else started_at end,
    ended_at = case when p_status = 'ended' then now() else ended_at end
  where id = p_show;
end $$;

-- ---------------------------------------------------------------- pannello di approvazione
create or replace function public.seller_admin_list(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_gemologist(p_token) then raise exception 'Token non valido'; end if;
  return jsonb_build_object(
    'billing_mode', public._billing_mode(),
    'legal_ready', public._legal_ready(),
    'mail_mode', coalesce(public._cfg('MAIL_MODE'), 'hold'),
    'plan', jsonb_build_object('price_cents', public._plan('PLAN_PRICE_CENTS'), 'lives_per_month', public._plan('PLAN_LIVES_PER_MONTH'), 'live_max_min', public._plan('PLAN_LIVE_MAX_MIN')),
    'blocked_links', (select count(*) from public.outbox where template = 'approved_payment' and status = 'blocked'),
    'alerts', coalesce((select jsonb_agg(jsonb_build_object('at', received_at, 'type', type, 'result', result) order by received_at desc)
                          from public.billing_events where result like 'duplicate:%' or result = 'mismatch'
                             or (result = 'mode_mismatch' and (payload->>'livemode')::boolean)), '[]'::jsonb),
    'applications', coalesce((select jsonb_agg(r order by r.pending desc, r.submitted_at desc nulls last) from (
      select a.id, a.name as brand, a.legal_name, a.vat_number, a.contact_name, a.email, a.phone, a.country, a.city, a.site, a.instagram,
             a.kind, a.categories, a.description, a.show_what, a.status, a.source, a.info_request, a.notes, a.lang,
             a.status = 'new' as pending, coalesce(a.submitted_at, a.created_at) as submitted_at, a.decided_at,
             a.user_id is not null as has_account, a.logo_path is not null as has_logo, coalesce(array_length(a.photo_paths, 1), 0) as photos,
             j.slug, j.is_public,
             w.prize_name, w.mode as prize_mode, w.status as prize_status, w.first_month_cents as prize_cents, w.prize_kind,
             coalesce(s.first_month_cents,
                      case when w.mode = 'live' and w.prize_kind = 'discount' and w.status in ('linked', 'confirmed') then w.first_month_cents end,
                      public._plan('PLAN_PRICE_CENTS')) as first_month_cents,
             s.status as subscription_status, s.livemode = false as test_payment, s.activated_at, s.current_period_end, s.last_payment_failed_at,
             o.status as link_status, o.created_at as link_created_at, o.sent_at as link_sent_at,
             case when s.status = 'awaiting_payment' and public._billing_mode() <> 'off' then s.pay_token end as pay_token
        from public.applications a
        left join public.jewelers j on j.id = a.jeweler_id
        left join lateral (select * from public.wheel_spins x where x.status <> 'void'
                             and (x.application_id = a.id or (a.user_id is not null and x.user_id = a.user_id) or x.email = lower(a.email))
                           order by (x.mode = 'live') desc, x.created_at limit 1) w on true
        left join public.subscriptions s on s.application_id = a.id
        left join public.outbox o on o.id = s.link_mail_id) r), '[]'::jsonb));
end $$;

-- off: nessun pagamento; test: link visibili a te per le prove, email ferme; live: le email con i link partono
create or replace function public.billing_admin_set_mode(p_token text, p_mode text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare n int := 0; r record; v_subs uuid[] := '{}'; v_spins uuid[] := '{}'; v_apps uuid[] := '{}';
begin
  if not public.is_gemologist(p_token) then raise exception 'Token non valido'; end if;
  if p_mode not in ('off', 'test', 'live') then raise exception 'Modalità non valida'; end if;
  if p_mode = 'live' then
    for r in select id, spin_id, application_id from public.subscriptions where livemode = false for update loop
      v_subs := v_subs || r.id; v_spins := v_spins || r.spin_id; v_apps := v_apps || r.application_id;
    end loop;
  end if;
  insert into public.app_config (key, value, updated_at) values ('BILLING_MODE', p_mode, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  if p_mode = 'live' then
    update public.outbox set status = 'cancelled'
     where template = 'activated' and status in ('queued', 'held', 'blocked', 'sending') and application_id = any (v_apps);
    update public.wheel_spins set status = 'confirmed', redeemed_at = null, subscription_ref = null
     where status = 'redeemed' and id = any (v_spins);
    update public.subscriptions set status = 'awaiting_payment', livemode = null, activated_at = null, stripe_customer_id = null,
           stripe_subscription_id = null, checkout_session_id = null, checkout_url = null, checkout_expires_at = null, checkout_started_at = null,
           checkout_generation = checkout_generation + 1, current_period_start = null, current_period_end = null,
           last_payment_failed_at = null, canceled_at = null, last_sub_event_at = null, activation_mail_id = null, updated_at = now()
     where id = any (v_subs);
    update public.outbox set status = 'queued' where template = 'approved_payment' and status = 'blocked';
    get diagnostics n = row_count;
    if n > 0 then perform public._poke_mailer(); end if;
  end if;
  return public.seller_admin_list(p_token) || jsonb_build_object('released', n);
end $$;

-- ---------------------------------------------------------------- permessi
revoke execute on function public.billing_checkout_start(text), public.billing_checkout_saved(uuid, int, text, text, timestamptz, text),
  public.billing_apply_event(jsonb), public.billing_mode_get(), public.billing_event_note(text, text), public._billing_activate(uuid), public._billing_open(uuid, uuid), public._account(),
  public._wheel_bind(uuid, uuid), public._plan(text), public._billing_mode(), public._legal_ready(), public._ts(jsonb)
  from public, anon, authenticated;
revoke execute on function public.account_me(), public.account_claim_spin(uuid), public.account_submit_application(jsonb) from public, anon;
-- si entra solo dall'account: niente candidature anonime, niente premi legati a un'email scritta a mano
revoke execute on function public.submit_application(jsonb), public.wheel_link(uuid, uuid, text, text) from public, anon, authenticated;
do $$ begin
  execute 'revoke execute on function public.apply_seller(text, text, text, text, text, text, text, text) from public, anon, authenticated';
exception when undefined_function then null; end $$;
do $$ begin
  execute 'revoke execute on function public.apply_seller(text, text, text, text, text, text, text, text, uuid) from public, anon, authenticated';
exception when undefined_function then null; end $$;
revoke execute on function public._show_quota(uuid, timestamptz, uuid), public._live_quota(uuid), public._sub_period(timestamptz, timestamptz), public._quota_msg(timestamptz, timestamptz, text),
  public.mailer_claim(int), public._vat_key(text) from public, anon, authenticated;
grant execute on function public.mailer_claim(int) to service_role;
grant execute on function public.account_me(), public.account_claim_spin(uuid), public.account_submit_application(jsonb) to authenticated;
grant execute on function public.billing_checkout_start(text), public.billing_checkout_saved(uuid, int, text, text, timestamptz, text),
  public.billing_apply_event(jsonb), public.billing_mode_get(), public.billing_event_note(text, text) to service_role;
