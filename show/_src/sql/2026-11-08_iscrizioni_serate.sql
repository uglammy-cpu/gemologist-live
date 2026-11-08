-- 8/11/2026 (Elena): sulle slide degli eventi il visitatore si iscrive alla live con l'email.
-- Le iscrizioni stanno in public.follows con night_id; il giorno della serata le avvisiamo (all'inizio a mano da Gmail).
alter table public.follows add column if not exists night_id uuid references public.nights(id) on delete cascade;
create unique index if not exists follows_email_night_uq on public.follows (email, night_id) where night_id is not null;

create or replace function public.follow_night(p_email text, p_night uuid, p_lang text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_email text; v_cat text;
begin
  v_email := lower(trim(coalesce(p_email, '')));
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Email non valida'; end if;
  select n.category into v_cat from nights n where n.id = p_night and n.is_public and n.starts_at > now() - interval '1 day';
  if not found then raise exception 'Serata non trovata'; end if;
  if (select count(*) from follows f where f.email = v_email and f.created_at > now() - interval '1 hour') >= 20 then raise exception 'Troppe richieste'; end if;
  insert into follows (email, category, lang, night_id)
  values (v_email, v_cat, case when p_lang in ('it','en','fr','ar','ru') then p_lang else 'it' end, p_night)
  on conflict do nothing;
  return true;
end $function$;

revoke all on function public.follow_night(text, uuid, text) from public;
grant execute on function public.follow_night(text, uuid, text) to anon, authenticated;
