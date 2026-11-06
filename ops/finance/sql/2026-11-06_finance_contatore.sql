-- FINANCE · contatore LiveKit (6 novembre 2026, autorizzato da Elena)
-- Migrazione SOLO AGGIUNTIVA: nuovo schema `finance`, nessuna tabella esistente toccata.
-- Il webhook di LiveKit arriva alla funzione `finance-livekit`, che verifica la firma
-- e chiama public.finance_livekit_ingest (eseguibile solo con la chiave di servizio).
-- Nessun nome, email o metadato dei partecipanti: solo identità tecniche (staff:/viewer:/agent-) e orari.

create schema if not exists finance;
revoke all on schema finance from public;
revoke all on schema finance from anon, authenticated;

-- Stanze video (una riga per sessione di stanza LiveKit)
create table if not exists finance.lk_rooms (
  room_sid    text primary key,
  room_name   text not null,
  show_id     uuid,
  started_at  timestamptz,
  finished_at timestamptz,
  updated_at  timestamptz not null default now()
);

-- Presenze (una riga per partecipante per sessione)
create table if not exists finance.lk_participants (
  participant_sid text primary key,
  room_sid        text,
  room_name       text not null,
  show_id         uuid,
  kind            text not null check (kind in ('staff', 'viewer', 'agent', 'egress', 'ingress', 'altro')),
  role            text,
  joined_at       timestamptz not null,
  left_at         timestamptz,
  ended_how       text check (ended_how in ('left', 'aborted', 'room_finished')),
  updated_at      timestamptz not null default now()
);
create index if not exists lk_participants_joined_idx on finance.lk_participants (joined_at);
create index if not exists lk_participants_room_idx on finance.lk_participants (room_sid);

-- Registro degli eventi ricevuti: serve a non contare due volte lo stesso evento
create table if not exists finance.lk_events (
  event_id        text primary key,
  event           text not null,
  room_name       text,
  participant_sid text,
  event_at        timestamptz not null,
  received_at     timestamptz not null default now()
);
create index if not exists lk_events_received_idx on finance.lk_events (received_at);

alter table finance.lk_rooms enable row level security;
alter table finance.lk_participants enable row level security;
alter table finance.lk_events enable row level security;
revoke all on all tables in schema finance from public;
revoke all on all tables in schema finance from anon, authenticated;

-- Orario da un campo LiveKit in secondi o millisecondi (stringa o numero); null se assente o zero
create or replace function finance._lk_ts(p_sec text, p_ms text)
returns timestamptz language sql immutable set search_path = pg_catalog as $$
  select case
    when p_ms ~ '^[0-9]+$' and p_ms::numeric > 0 then to_timestamp(p_ms::numeric / 1000)
    when p_sec ~ '^[0-9]+$' and p_sec::numeric > 0 then to_timestamp(p_sec::numeric)
    else null end
$$;

-- Registrazione di un evento (chiamata solo dalla funzione finance-livekit)
create or replace function public.finance_livekit_ingest(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = finance, public, pg_temp
as $$
declare
  v_id    text := nullif(p->>'id', '');
  v_event text := p->>'event';
  v_at    timestamptz := coalesce(finance._lk_ts(p->>'createdAt', null), now());
  v_room  text := p->'room'->>'name';
  v_rsid  text := p->'room'->>'sid';
  v_pt    jsonb := p->'participant';
  v_psid  text;
  v_ident text;
  v_pkind text;
  v_kind  text;
  v_role  text;
  v_show  uuid;
  v_join  timestamptz;
begin
  if v_event is null then
    return jsonb_build_object('ok', false, 'motivo', 'evento senza nome');
  end if;

  if v_id is not null then
    insert into finance.lk_events (event_id, event, room_name, participant_sid, event_at)
    values (v_id, v_event, v_room, v_pt->>'sid', v_at)
    on conflict (event_id) do nothing;
    if not found then
      return jsonb_build_object('ok', true, 'doppione', true);
    end if;
  end if;

  if v_room ~ '^show-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_show := substr(v_room, 6)::uuid;
  end if;

  if v_rsid is not null and v_room is not null then
    insert into finance.lk_rooms (room_sid, room_name, show_id, started_at)
    values (v_rsid, v_room, v_show, case when v_event = 'room_started' then v_at end)
    on conflict (room_sid) do update
      set started_at = coalesce(least(finance.lk_rooms.started_at, excluded.started_at), finance.lk_rooms.started_at, excluded.started_at),
          updated_at = now();
  end if;

  if v_event = 'room_finished' and v_rsid is not null then
    update finance.lk_rooms set finished_at = v_at, updated_at = now() where room_sid = v_rsid;
    update finance.lk_participants
       set left_at = v_at, ended_how = 'room_finished', updated_at = now()
     where room_sid = v_rsid and left_at is null;

  elsif v_event in ('participant_joined', 'participant_left', 'participant_connection_aborted')
        and v_pt is not null and coalesce(v_pt->>'sid', '') <> '' and v_room is not null then
    v_psid  := v_pt->>'sid';
    v_ident := coalesce(v_pt->>'identity', '');
    v_pkind := upper(coalesce(v_pt->>'kind', ''));
    v_kind := case
      when v_pkind in ('AGENT', '4') or v_ident like 'agent-%' then 'agent'
      when v_pkind in ('EGRESS', '2') then 'egress'
      when v_pkind in ('INGRESS', '1') then 'ingress'
      when v_ident like 'staff:%' then 'staff'
      when v_ident like 'viewer:%' then 'viewer'
      else 'altro' end;
    v_role := case when v_kind = 'staff' then nullif(split_part(v_ident, ':', 2), '') end;
    v_join := coalesce(finance._lk_ts(v_pt->>'joinedAt', v_pt->>'joinedAtMs'), v_at);

    insert into finance.lk_participants (participant_sid, room_sid, room_name, show_id, kind, role, joined_at)
    values (v_psid, v_rsid, v_room, v_show, v_kind, v_role, v_join)
    on conflict (participant_sid) do update
      set joined_at = least(finance.lk_participants.joined_at, excluded.joined_at),
          room_sid = coalesce(finance.lk_participants.room_sid, excluded.room_sid),
          updated_at = now();

    if v_event <> 'participant_joined' then
      update finance.lk_participants
         set left_at = v_at,
             ended_how = case when v_event = 'participant_left' then 'left' else 'aborted' end,
             updated_at = now()
       where participant_sid = v_psid;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'evento', v_event);
end;
$$;
revoke all on function public.finance_livekit_ingest(jsonb) from public;
revoke all on function public.finance_livekit_ingest(jsonb) from anon, authenticated;
grant execute on function public.finance_livekit_ingest(jsonb) to service_role;

-- Lettura: presenze con minuti e distinzione fra prova e dirette vere
create or replace view finance.lk_presenze as
select p.participant_sid, p.room_name, p.show_id, p.kind, p.role, p.joined_at, p.left_at, p.ended_how,
       j.slug as seller_slug,
       (p.show_id is null or j.slug is null
        or j.slug = any (array['rossi', 'ferri', 'lombardi', 'marchetti', 'pietrerare'])) as prova,
       greatest(0, extract(epoch from (coalesce(p.left_at, now()) - p.joined_at)) / 60.0) as minuti,
       (p.left_at is null) as ancora_connesso
  from finance.lk_participants p
  left join public.shows s on s.id = p.show_id
  left join public.jewelers j on j.id = s.jeweler_id;
revoke all on finance.lk_presenze from public;
revoke all on finance.lk_presenze from anon, authenticated;

-- Riepilogo del mese per FINANCE (minuti, stima della banda, percentuali delle quote del piano Build)
create or replace function finance.livekit_mese(p_mese date default (now() at time zone 'Europe/Rome')::date)
returns jsonb language sql stable set search_path = finance, public, pg_temp as $$
  with m as (
    select * from finance.lk_presenze
     where (joined_at at time zone 'Europe/Rome') >= date_trunc('month', p_mese)
       and (joined_at at time zone 'Europe/Rome') <  date_trunc('month', p_mese) + interval '1 month'
  )
  select jsonb_build_object(
    'mese', to_char(p_mese, 'MM/YYYY'),
    'minuti_partecipante', round(coalesce(sum(minuti) filter (where kind in ('staff', 'viewer', 'altro')), 0)),
    'minuti_agente', round(coalesce(sum(minuti) filter (where kind = 'agent'), 0)),
    'minuti_spettatori', round(coalesce(sum(minuti) filter (where kind = 'viewer'), 0)),
    'minuti_di_prova', round(coalesce(sum(minuti) filter (where prova), 0)),
    'minuti_dirette_vere', round(coalesce(sum(minuti) filter (where not prova), 0)),
    'gb_stimati_spettatori', round(coalesce(sum(minuti) filter (where kind = 'viewer'), 0) * 1.5 * 60 / 8 / 1000, 2),
    'quota_build_minuti_pct', round(100 * coalesce(sum(minuti) filter (where kind in ('staff', 'viewer', 'altro')), 0) / 5000.0, 1),
    'quota_build_agente_pct', round(100 * coalesce(sum(minuti) filter (where kind = 'agent'), 0) / 1000.0, 1),
    'presenze', count(*),
    'ancora_connessi', count(*) filter (where ancora_connesso),
    'nota', 'banda stimata a 1,5 Mbps per spettatore; i minuti fatturati veri restano quelli della console LiveKit'
  ) from m
$$;
revoke all on function finance.livekit_mese(date) from public;

-- Pulizia: registro eventi tenuto 90 giorni (le presenze restano)
do $$
begin
  if exists (select 1 from cron.job where jobname = 'finance-pulizia') then
    perform cron.unschedule('finance-pulizia');
  end if;
  perform cron.schedule('finance-pulizia', '53 3 * * *',
    $job$delete from finance.lk_events where received_at < now() - interval '90 days'$job$);
end $$;
