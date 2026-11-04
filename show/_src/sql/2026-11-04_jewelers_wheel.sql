-- THE JEWELER'S WHEEL — gioco promozionale per i gioiellieri sulla pagina /join
-- 4 novembre 2026
--
-- Principi:
-- * il premio lo decide il server, il browser mostra soltanto l'animazione;
-- * un giro valido per dispositivo e per modalità; un premio confermato per gioielliere
--   (email e partita IVA), confermato solo quando la gemmologa approva la candidatura;
-- * tre modalità: off (spenta), demo (solo con link di anteprima, nulla di riscattabile),
--   live (pubblica). La live si accende solo registrando il riferimento della verifica legale
--   e solo se ogni premio visibile è erogabile e ha una probabilità definita;
-- * tabelle chiuse (RLS senza policy, nessun permesso al ruolo anonimo): si passa solo dalle funzioni.

-- ---------------------------------------------------------------- tabelle
create table if not exists public.wheel_config (
  id int primary key default 1 check (id = 1),
  mode text not null default 'demo' check (mode in ('off', 'demo', 'live')),
  standard_cents int not null default 14900,
  setup_fee_cents int not null default 29000 check (setup_fee_cents >= 0),
  legal_ref text,
  live_since timestamptz,
  ip_window_hours int not null default 24 check (ip_window_hours between 0 and 720),
  updated_at timestamptz not null default now()
);
insert into public.wheel_config (id) values (1) on conflict do nothing;

create table if not exists public.wheel_prizes (
  code text primary key,
  position int not null,
  kind text not null check (kind in ('discount', 'perk')),
  name text not null,
  first_month_cents int not null check (first_month_cents > 0),
  weight int not null default 0 check (weight >= 0),
  active boolean not null default true,
  deliverable boolean not null default true,
  delivery_note text,
  updated_at timestamptz not null default now(),
  -- solo il primo mese può essere scontato, mai gratuito; i vantaggi promozionali restano a prezzo pieno
  constraint wheel_prize_price check ((kind = 'discount' and first_month_cents < 14900) or (kind = 'perk' and first_month_cents = 14900))
);

insert into public.wheel_prizes (code, position, kind, name, first_month_cents, active, deliverable, delivery_note) values
  ('silver',            1, 'discount', 'Silver Welcome',    12900, true, true,  null),
  ('golden_visibility', 2, 'perk',     'Golden Visibility', 14900, true, false, 'Manca la funzione: 7 giorni in evidenza nella sezione dei venditori.'),
  ('gold',              3, 'discount', 'Gold Welcome',      11900, true, true,  null),
  ('golden_promotion',  4, 'perk',     'Golden Promotion',  14900, true, false, 'Manca il generatore automatico del reel da template.'),
  ('platinum',          5, 'discount', 'Platinum Welcome',  10900, true, true,  null),
  ('golden_spotlight',  6, 'perk',     'Golden Spotlight',  14900, true, false, 'Oggi solo a mano: slide del carosello in home per 7 giorni.'),
  ('diamond',           7, 'discount', 'Diamond Welcome',    9900, true, true,  null)
on conflict (code) do nothing;

create table if not exists public.wheel_spins (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  device uuid not null,
  mode text not null check (mode in ('demo', 'live')),
  prize_code text not null references public.wheel_prizes(code),
  prize_name text not null,
  prize_kind text not null,
  first_month_cents int not null,
  status text not null default 'provisional' check (status in ('provisional', 'linked', 'confirmed', 'redeemed', 'void')),
  void_reason text,
  ip_hash text,
  lang text,
  repeat_of uuid references public.wheel_spins(id) on delete set null,
  email text,
  vat_number text,
  linked_at timestamptz,
  application_id uuid references public.applications(id) on delete set null,
  jeweler_id uuid references public.jewelers(id) on delete set null,
  confirmed_at timestamptz,
  promo_code text unique,
  redeemed_at timestamptz,
  subscription_ref text,
  delivery_status text not null default 'n/a' check (delivery_status in ('n/a', 'pending', 'delivered')),
  delivered_at timestamptz,
  unique (device, mode)
);
create index if not exists wheel_spins_email on public.wheel_spins (email) where email is not null;
create index if not exists wheel_spins_vat on public.wheel_spins (vat_number) where vat_number is not null;
create index if not exists wheel_spins_ip on public.wheel_spins (ip_hash, created_at);

create table if not exists public.wheel_events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  session uuid not null,
  device uuid,
  event text not null check (event in ('popup_view', 'close_no_spin', 'spin_click', 'prize_shown', 'claim_click', 'gift_button', 'application_linked')),
  mode text not null,
  spin_id uuid,
  lang text,
  unique (session, event)
);

create table if not exists public.wheel_audit (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  actor text,
  action text not null,
  detail jsonb
);

alter table public.wheel_config enable row level security;
alter table public.wheel_prizes enable row level security;
alter table public.wheel_spins  enable row level security;
alter table public.wheel_events enable row level security;
alter table public.wheel_audit  enable row level security;
revoke all on public.wheel_config, public.wheel_prizes, public.wheel_spins, public.wheel_events, public.wheel_audit from anon, authenticated;
revoke all on sequence public.wheel_events_id_seq, public.wheel_audit_id_seq from anon, authenticated;

insert into public.app_config (key, value)
select 'WHEEL_SALT', encode(extensions.gen_random_bytes(24), 'hex')
where not exists (select 1 from public.app_config where key = 'WHEEL_SALT');

-- ---------------------------------------------------------------- utilità interne
create or replace function public._wheel_ip_hash() returns text
language plpgsql stable security definer set search_path = public, extensions as $$
declare h json; ip text;
begin
  begin h := current_setting('request.headers', true)::json; exception when others then h := null; end;
  if h is null then return null; end if;
  ip := coalesce(nullif(h->>'cf-connecting-ip', ''), nullif(trim(split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1)), ''), nullif(h->>'x-real-ip', ''));
  if ip is null then return null; end if;
  -- l'indirizzo IP non si conserva: solo un'impronta con sale segreto
  return encode(digest(ip || coalesce(public._cfg('WHEEL_SALT'), ''), 'sha256'), 'hex');
end $$;

-- numero casuale crittografico in [0, n)
create or replace function public._wheel_rand(n bigint) returns bigint
language sql volatile set search_path = public, extensions as $$
  select (('x' || encode(gen_random_bytes(6), 'hex'))::bit(48)::bigint % greatest(n, 1));
$$;

create or replace function public._wheel_spin_json(s public.wheel_spins) returns jsonb
language sql stable as $$
  select case when s.id is null then null else jsonb_build_object(
    'id', s.id, 'mode', s.mode, 'prize_code', s.prize_code, 'prize_name', s.prize_name, 'kind', s.prize_kind,
    'first_month_cents', s.first_month_cents, 'status', s.status, 'created_at', s.created_at,
    'linked', s.email is not null) end;
$$;

create or replace function public._wheel_actor(p_token text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(display_name, role) from public.staff_tokens where token = p_token and role = 'gemologist';
$$;

-- in modalità live ogni premio visibile deve essere erogabile e avere una probabilità definita
create or replace function public._wheel_live_problems() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(msg), '{}') from (
    select name || ': non ancora erogabile' as msg from public.wheel_prizes where active and not deliverable
    union all
    select name || ': probabilità non definita' from public.wheel_prizes where active and weight = 0
    union all
    select 'Nessun premio attivo' where not exists (select 1 from public.wheel_prizes where active)
  ) x;
$$;

-- ---------------------------------------------------------------- funzioni pubbliche
create or replace function public.wheel_state(p_device uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c public.wheel_config; s public.wheel_spins;
begin
  select * into c from public.wheel_config where id = 1;
  if c.mode = 'off' then return jsonb_build_object('mode', 'off'); end if;
  if p_device is not null then
    select * into s from public.wheel_spins where device = p_device and mode = c.mode;
  end if;
  return jsonb_build_object(
    'mode', c.mode,
    'standard_cents', c.standard_cents,
    'setup_fee_cents', c.setup_fee_cents,
    'prizes', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'kind', kind, 'name', name, 'first_month_cents', first_month_cents) order by position)
                          from public.wheel_prizes where active), '[]'::jsonb),
    'spin', public._wheel_spin_json(s));
end $$;

create or replace function public.wheel_spin(p_device uuid, p_session uuid, p_lang text) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare c public.wheel_config; s public.wheel_spins; prev public.wheel_spins; p public.wheel_prizes;
        v_ip text := public._wheel_ip_hash(); v_total bigint; v_r bigint; v_code text;
begin
  if p_device is null then raise exception 'Dispositivo mancante'; end if;
  select * into c from public.wheel_config where id = 1;
  if c.mode = 'off' then raise exception 'Promozione non attiva'; end if;

  -- un solo giro valido per dispositivo: chi ha già giocato rivede il suo premio
  select * into s from public.wheel_spins where device = p_device and mode = c.mode;
  if s.id is not null then return public._wheel_spin_json(s) || jsonb_build_object('existing', true); end if;

  if v_ip is not null and (select count(*) from public.wheel_spins where ip_hash = v_ip and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Troppi tentativi, riprova più tardi';
  end if;

  if c.mode = 'live' then
    if cardinality(public._wheel_live_problems()) > 0 then raise exception 'Promozione non disponibile'; end if;
    -- stesso indirizzo nelle ultime ore: stesso premio (svuotare il browser non dà un secondo tentativo)
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
    -- demo: equiprobabile fra i premi attivi, solo dimostrativo, nulla di riscattabile
    select count(*) into v_total from public.wheel_prizes where active;
    v_r := public._wheel_rand(v_total);
    select * into p from public.wheel_prizes where active order by position, code offset v_r limit 1;
  end if;
  if p.code is null then raise exception 'Promozione non disponibile'; end if;

  insert into public.wheel_spins (device, mode, prize_code, prize_name, prize_kind, first_month_cents, ip_hash, lang, repeat_of)
  values (p_device, c.mode, p.code, p.name, p.kind, p.first_month_cents, v_ip, left(coalesce(p_lang, ''), 5), prev.id)
  returning * into s;
  return public._wheel_spin_json(s) || jsonb_build_object('existing', false);
end $$;

-- il visitatore che ha girato manda la candidatura: il premio resta provvisorio ma si lega all'identità dichiarata
create or replace function public.wheel_link(p_device uuid, p_session uuid, p_email text, p_vat text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare c public.wheel_config; s public.wheel_spins; v_email text := lower(trim(coalesce(p_email, '')));
        v_vat text := nullif(upper(regexp_replace(trim(coalesce(p_vat, '')), '\s', '', 'g')), '');
begin
  select * into c from public.wheel_config where id = 1;
  if c.mode = 'off' or p_device is null then return null; end if;
  select * into s from public.wheel_spins where device = p_device and mode = c.mode;
  if s.id is null then return null; end if;
  if s.status not in ('provisional', 'linked') then return public._wheel_spin_json(s); end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Email non valida'; end if;
  update public.wheel_spins set email = left(v_email, 160), vat_number = left(coalesce(v_vat, vat_number), 40),
         status = 'linked', linked_at = coalesce(linked_at, now())
   where id = s.id returning * into s;
  if p_session is not null then
    insert into public.wheel_events (session, device, event, mode, spin_id)
    values (p_session, p_device, 'application_linked', c.mode, s.id) on conflict do nothing;
  end if;
  return public._wheel_spin_json(s);
end $$;

create or replace function public.wheel_track(p_session uuid, p_device uuid, p_event text, p_lang text) returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_mode text; v_spin uuid;
begin
  if p_session is null or p_event not in ('popup_view', 'close_no_spin', 'spin_click', 'prize_shown', 'claim_click', 'gift_button') then return; end if;
  select mode into v_mode from public.wheel_config where id = 1;
  if v_mode = 'off' then return; end if;
  select id into v_spin from public.wheel_spins where device = p_device and mode = v_mode;
  -- una sola volta per sessione: riaprire il pop-up non gonfia i numeri
  insert into public.wheel_events (session, device, event, mode, spin_id, lang)
  values (p_session, p_device, p_event, v_mode, v_spin, left(coalesce(p_lang, ''), 5)) on conflict do nothing;
end $$;

-- ---------------------------------------------------------------- conferma all'approvazione della candidatura
create or replace function public._wheel_on_application() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare s public.wheel_spins; v_vat text;
begin
  if new.status is not distinct from old.status or new.status <> 'approved' then return new; end if;
  begin
    v_vat := nullif(upper(regexp_replace(coalesce(new.vat_number, ''), '\s', '', 'g')), '');
    for s in
      select * from public.wheel_spins
       where status = 'linked' and (email = lower(new.email) or (v_vat is not null and vat_number = v_vat))
       order by created_at
    loop
      if exists (select 1 from public.wheel_spins x
                  where x.status in ('confirmed', 'redeemed') and x.mode = s.mode
                    and (x.email = s.email or (s.vat_number is not null and x.vat_number = s.vat_number)
                         or (new.jeweler_id is not null and x.jeweler_id = new.jeweler_id))) then
        update public.wheel_spins set status = 'void', void_reason = 'Un premio è già stato assegnato a questo gioielliere' where id = s.id;
      elsif exists (select 1 from public.seller_private sp where sp.email = s.email and sp.jeweler_id is distinct from new.jeweler_id)
         or exists (select 1 from public.jewelers j where j.id is distinct from new.jeweler_id and (lower(j.contact_email) = s.email or (s.vat_number is not null and upper(j.vat_number) = s.vat_number))) then
        update public.wheel_spins set status = 'void', void_reason = 'Già venditore della piattaforma' where id = s.id;
      else
        update public.wheel_spins set status = 'confirmed', confirmed_at = now(), application_id = new.id, jeweler_id = new.jeweler_id,
               promo_code = case when s.mode = 'live' then 'UQ-' else 'DEMO-' end || upper(encode(gen_random_bytes(4), 'hex')),
               delivery_status = case when s.prize_kind = 'perk' then 'pending' else 'n/a' end
         where id = s.id;
      end if;
    end loop;
  exception when others then
    -- la ruota non deve mai bloccare un'approvazione
    raise warning 'wheel: %', sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists wheel_on_application on public.applications;
create trigger wheel_on_application after update of status on public.applications
  for each row execute function public._wheel_on_application();

-- ---------------------------------------------------------------- amministrazione (solo gemmologa)
create or replace function public.wheel_admin_get(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c public.wheel_config;
begin
  if not public.is_gemologist(p_token) then raise exception 'Token non valido'; end if;
  select * into c from public.wheel_config where id = 1;
  return jsonb_build_object(
    'config', to_jsonb(c),
    'live_problems', to_jsonb(public._wheel_live_problems()),
    'prizes', (select jsonb_agg(to_jsonb(p) order by position) from public.wheel_prizes p),
    'spins', coalesce((select jsonb_agg(x order by x.created_at desc) from (
        select s.id, s.created_at, s.mode, s.prize_name, s.prize_kind, s.first_month_cents, s.status, s.void_reason, s.email, s.vat_number,
               s.promo_code, s.confirmed_at, s.redeemed_at, s.subscription_ref, s.delivery_status, s.repeat_of is not null as repeat,
               a.name as application_name, j.name as jeweler_name, j.slug as jeweler_slug
          from public.wheel_spins s left join public.applications a on a.id = s.application_id left join public.jewelers j on j.id = s.jeweler_id
         order by s.created_at desc limit 500) x), '[]'::jsonb),
    'funnel', coalesce((select jsonb_object_agg(mode, f) from (
        select m.mode, jsonb_build_object(
          'popup_view',   (select count(*) from public.wheel_events e where e.mode = m.mode and e.event = 'popup_view'),
          'visitors',     (select count(distinct coalesce(e.device, e.session)) from public.wheel_events e where e.mode = m.mode and e.event = 'popup_view'),
          'close_no_spin',(select count(*) from public.wheel_events e where e.mode = m.mode and e.event = 'close_no_spin'),
          'spin_click',   (select count(*) from public.wheel_events e where e.mode = m.mode and e.event = 'spin_click'),
          'prize_shown',  (select count(*) from public.wheel_events e where e.mode = m.mode and e.event = 'prize_shown'),
          'claim_click',  (select count(*) from public.wheel_events e where e.mode = m.mode and e.event = 'claim_click'),
          'gift_button',  (select count(*) from public.wheel_events e where e.mode = m.mode and e.event = 'gift_button'),
          'linked',       (select count(*) from public.wheel_spins s where s.mode = m.mode and s.email is not null),
          'confirmed',    (select count(*) from public.wheel_spins s where s.mode = m.mode and s.status in ('confirmed', 'redeemed')),
          'redeemed',     (select count(*) from public.wheel_spins s where s.mode = m.mode and s.status = 'redeemed'),
          'avg_first_month_cents', (select round(avg(first_month_cents)) from public.wheel_spins s where s.mode = m.mode and s.status = 'redeemed')
        ) f from (values ('demo'), ('live')) m(mode)) y), '{}'::jsonb),
    'audit', coalesce((select jsonb_agg(to_jsonb(a) order by a.id desc) from (select * from public.wheel_audit order by id desc limit 50) a), '[]'::jsonb));
end $$;

create or replace function public.wheel_admin_set_mode(p_token text, p_mode text, p_legal_ref text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_actor text := public._wheel_actor(p_token); v_problems text[];
begin
  if v_actor is null then raise exception 'Token non valido'; end if;
  if p_mode not in ('off', 'demo', 'live') then raise exception 'Modalità non valida'; end if;
  if p_mode = 'live' then
    if length(trim(coalesce(p_legal_ref, ''))) < 8 then
      raise exception 'Per la modalità pubblica serve il riferimento della verifica legale (DPR 430/2001): chi l''ha fatta e quando.';
    end if;
    v_problems := public._wheel_live_problems();
    if cardinality(v_problems) > 0 then raise exception 'Non si può pubblicare: %', array_to_string(v_problems, '; '); end if;
  end if;
  update public.wheel_config set mode = p_mode,
         legal_ref = case when p_mode = 'live' then left(trim(p_legal_ref), 400) else legal_ref end,
         live_since = case when p_mode = 'live' and mode <> 'live' then now() else live_since end,
         updated_at = now() where id = 1;
  insert into public.wheel_audit (actor, action, detail) values (v_actor, 'mode', jsonb_build_object('mode', p_mode, 'legal_ref', p_legal_ref));
  return public.wheel_admin_get(p_token);
end $$;

create or replace function public.wheel_admin_save_prize(p_token text, p_code text, p_active boolean, p_weight int, p_first_month_cents int, p_deliverable boolean) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_actor text := public._wheel_actor(p_token); old public.wheel_prizes; nw public.wheel_prizes;
begin
  if v_actor is null then raise exception 'Token non valido'; end if;
  select * into old from public.wheel_prizes where code = p_code;
  if old.code is null then raise exception 'Premio non trovato'; end if;
  update public.wheel_prizes set active = coalesce(p_active, active), weight = coalesce(p_weight, weight),
         first_month_cents = coalesce(p_first_month_cents, first_month_cents), deliverable = coalesce(p_deliverable, deliverable), updated_at = now()
   where code = p_code returning * into nw;
  if (select mode from public.wheel_config where id = 1) = 'live' and cardinality(public._wheel_live_problems()) > 0 then
    raise exception 'Con la ruota pubblica questa modifica non è possibile: %', array_to_string(public._wheel_live_problems(), '; ');
  end if;
  insert into public.wheel_audit (actor, action, detail) values (v_actor, 'prize', jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(nw)));
  return public.wheel_admin_get(p_token);
end $$;

create or replace function public.wheel_admin_save_config(p_token text, p_setup_fee_cents int, p_ip_window_hours int) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_actor text := public._wheel_actor(p_token);
begin
  if v_actor is null then raise exception 'Token non valido'; end if;
  update public.wheel_config set setup_fee_cents = coalesce(p_setup_fee_cents, setup_fee_cents),
         ip_window_hours = coalesce(p_ip_window_hours, ip_window_hours), updated_at = now() where id = 1;
  insert into public.wheel_audit (actor, action, detail) values (v_actor, 'config', jsonb_build_object('setup_fee_cents', p_setup_fee_cents, 'ip_window_hours', p_ip_window_hours));
  return public.wheel_admin_get(p_token);
end $$;

-- redeem: abbonamento attivato (riferimento fattura o pagamento); deliver: vantaggio erogato; void: annullato
create or replace function public.wheel_admin_spin_action(p_token text, p_spin uuid, p_action text, p_ref text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_actor text := public._wheel_actor(p_token); s public.wheel_spins;
begin
  if v_actor is null then raise exception 'Token non valido'; end if;
  select * into s from public.wheel_spins where id = p_spin for update;
  if s.id is null then raise exception 'Assegnazione non trovata'; end if;
  if p_action = 'redeem' then
    if s.status <> 'confirmed' then raise exception 'Si segna come abbonato solo un premio confermato e non ancora usato'; end if;
    if length(trim(coalesce(p_ref, ''))) = 0 then raise exception 'Serve il riferimento dell''abbonamento (fattura o pagamento)'; end if;
    update public.wheel_spins set status = 'redeemed', redeemed_at = now(), subscription_ref = left(trim(p_ref), 120) where id = s.id;
  elsif p_action = 'deliver' then
    if s.prize_kind <> 'perk' or s.status not in ('confirmed', 'redeemed') then raise exception 'Solo un vantaggio promozionale confermato'; end if;
    update public.wheel_spins set delivery_status = 'delivered', delivered_at = now() where id = s.id;
  elsif p_action = 'void' then
    if s.status = 'redeemed' then raise exception 'Un premio già usato non si annulla'; end if;
    update public.wheel_spins set status = 'void', void_reason = left(coalesce(nullif(trim(p_ref), ''), 'Annullato dalla gemmologa'), 200) where id = s.id;
  else
    raise exception 'Azione non valida';
  end if;
  insert into public.wheel_audit (actor, action, detail) values (v_actor, 'spin_' || p_action, jsonb_build_object('spin', p_spin, 'ref', p_ref));
  return public.wheel_admin_get(p_token);
end $$;

create or replace function public.wheel_admin_reset_demo(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_actor text := public._wheel_actor(p_token);
begin
  if v_actor is null then raise exception 'Token non valido'; end if;
  delete from public.wheel_events where mode = 'demo';
  delete from public.wheel_spins where mode = 'demo';
  insert into public.wheel_audit (actor, action, detail) values (v_actor, 'reset_demo', null);
  return public.wheel_admin_get(p_token);
end $$;

-- le funzioni interne non si chiamano dall'esterno
revoke execute on function public._wheel_ip_hash(), public._wheel_rand(bigint), public._wheel_actor(text),
  public._wheel_live_problems(), public._wheel_on_application(), public._wheel_spin_json(public.wheel_spins) from public, anon, authenticated;
