-- Uniqaia — flusso del seller dalla candidatura alla prima diretta (richiesta di Elena del 7/11/2026, ore 12:05)
--
-- Tutto il percorso vive nell'area del seller su uniqaia.com/join: candidatura → esito → pagamento →
-- abbonamento attivo, con il numero Founding, il pannello, il calendario e la guida della diretta.
-- Elena fa una sola cosa per seller: approva (o no) in /admin scegliendo la serata.
-- Il seller riceve UNA sola email: l'esito (approvazione con il link di pagamento, oppure non accolta /
-- richiesta di integrazioni). Non partono più l'email «candidatura ricevuta» (lo dice la pagina),
-- quella di attivazione (la ricevuta la manda Stripe; il pannello è nell'area) e l'avviso a seller@
-- (Elena riceve una notifica sul telefono da un compito automatico).
--
-- Founding 20 (approvata da Elena il 4/11/2026): i primi 20 seller che attivano l'abbonamento in produzione
-- ricevono un numero permanente da #01 a #20, in ordine di attivazione, una volta sola, mai riassegnato.
--
-- Migrazione aggiuntiva: una chiave di configurazione, una colonna, due trigger e funzioni nuove.
-- Nessuna funzione esistente cambia, salvo gem_admin_list (nuova di oggi) che mostra anche il numero Founding.
-- Dove: Supabase, progetto itoxzepuukyvdxxtfetf → SQL Editor → New query → incolla tutto → Run.
begin;

-- ---------- 1. una sola email al seller: le altre restano in coda come «Annullata» (si leggono in /admin, non partono)
insert into public.app_config (key, value) values ('MAIL_TEMPLATES_OFF', 'received,activated,admin_new')
  on conflict (key) do nothing;

create or replace function public._outbox_off()
 returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.template = any (string_to_array(replace(coalesce(public._cfg('MAIL_TEMPLATES_OFF'), ''), ' ', ''), ',')) then
    new.status := 'cancelled';
    new.error := 'non inviata: email tolta dal flusso del seller (decisione di Elena del 7/11/2026)';
  end if;
  return new;
end $$;
create or replace trigger outbox_off before insert on public.outbox for each row execute function public._outbox_off();

-- ---------- 2. Founding 20
alter table public.jewelers add column if not exists founding_no smallint;
create unique index if not exists jewelers_founding_no on public.jewelers (founding_no) where founding_no is not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'jewelers_founding_range') then
    alter table public.jewelers add constraint jewelers_founding_range check (founding_no between 1 and 20);
  end if;
end $$;

-- il numero arriva quando l'abbonamento diventa attivo davvero (produzione, non prova): il primo libero dopo l'ultimo dato
create or replace function public._founding_assign()
 returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v int;
begin
  if new.status = 'active' and new.livemode is true
     and (tg_op = 'INSERT' or old.status is distinct from 'active' or old.livemode is distinct from true) then
    perform pg_advisory_xact_lock(hashtext('founding_20'));
    if not exists (select 1 from public.jewelers where id = new.jeweler_id and founding_no is not null) then
      select coalesce(max(founding_no), 0) + 1 into v from public.jewelers;
      if v <= 20 then update public.jewelers set founding_no = v where id = new.jeweler_id; end if;
    end if;
  end if;
  return new;
end $$;
create or replace trigger subscriptions_founding after insert or update of status, livemode on public.subscriptions
  for each row execute function public._founding_assign();

-- quanti numeri restano (pubblico: è il contatore di /join, sempre vero)
create or replace function public.founding_left()
 returns integer language sql stable security definer set search_path to 'public' as $$
  select greatest(0, 20 - coalesce(max(founding_no), 0))::int from public.jewelers;
$$;
grant execute on function public.founding_left() to anon, authenticated;

-- ---------- 3. l'area del seller: serata, numero Founding, prossime serate prenotabili
create or replace function public.account_onboarding()
 returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare acc public.seller_accounts := public._account(); a public.applications; j public.jewelers;
begin
  select * into a from public.applications where user_id = acc.user_id;
  if a.jeweler_id is not null then select * into j from public.jewelers where id = a.jeweler_id; end if;
  return jsonb_build_object(
    'theme', j.night_theme,
    'founding_no', j.founding_no,
    'founding_left', public.founding_left(),
    'next_nights', coalesce((select jsonb_agg(jsonb_build_object('day', d.day, 'title', d.title) order by d.day)
                               from (select (n.starts_at at time zone 'Europe/Rome')::date as day, n.title from public.nights n
                                      where j.night_theme is not null and n.is_public and n.title = j.night_theme
                                        and n.starts_at > now() order by n.starts_at limit 3) d), '[]'::jsonb),
    'bookings', coalesce((select count(*) from public.shows s where s.jeweler_id = j.id and s.scheduled_at > now()), 0));
end $$;
revoke all on function public.account_onboarding() from public, anon;
grant execute on function public.account_onboarding() to authenticated;

-- ---------- 4. /admin: il numero Founding accanto a ogni seller
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
    'themes', coalesce((select jsonb_agg(jsonb_build_object('id', j.id, 'name', j.name, 'slug', j.slug, 'theme', j.night_theme, 'founding_no', j.founding_no) order by j.name)
                from public.jewelers j), '[]'::jsonb),
    'founding_left', public.founding_left());
end $$;

commit;

-- Controllo: email spente, numeri Founding liberi (devono essere 20).
select (select value from public.app_config where key = 'MAIL_TEMPLATES_OFF') as email_spente, public.founding_left() as founding_liberi;
