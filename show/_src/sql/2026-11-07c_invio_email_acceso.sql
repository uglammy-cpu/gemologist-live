-- Uniqaia — invio delle email acceso e quattro funzioni interne chiuse al pubblico (7/11/2026)
--
-- 1. Resend è collegato (dominio uniqaia.com verificato alle 12:56, chiave RESEND_API_KEY nei segreti alle 13:02):
--    MAIL_MODE passa da 'hold' a 'live'. In coda non c'è niente, quindi subito non parte nulla.
--    Da qui partono da sole: l'esito al seller (rifiuto, richiesta di integrazioni; l'approvazione con il link
--    solo quando i pagamenti sono accesi), gli inviti e gli allarmi gravi di Nikita (P0/P1) a ADMIN_EMAIL.
--    Restano spente, per il flusso del seller, le email in MAIL_TEMPLATES_OFF (received, activated, admin_new).
-- 2. Correzione di un errore del Marketing Manager (P1 della sentinella di Nikita): due funzioni interne del calendario,
--    _gem_free e _show_day, erano eseguibili da chiunque. Si chiudono, insieme alle due funzioni dei trigger di oggi.
--    Le usano solo funzioni security definer di proprietà di postgres, che continuano a funzionare.
-- Dove: Supabase, progetto itoxzepuukyvdxxtfetf → SQL Editor → New query → incolla tutto → Run.
begin;

update public.app_config set value = 'live' where key = 'MAIL_MODE';

revoke execute on function public._gem_free(timestamptz, uuid) from public, anon, authenticated;
revoke execute on function public._show_day(public.shows) from public, anon, authenticated;
revoke execute on function public._outbox_off() from public, anon, authenticated;
revoke execute on function public._founding_assign() from public, anon, authenticated;

commit;

-- Controllo: invio acceso, funzioni chiuse (devono essere tutte false).
select (select value from public.app_config where key = 'MAIL_MODE') as invio,
       has_function_privilege('anon', 'public._gem_free(timestamptz, uuid)', 'execute') as gem_free_aperta,
       has_function_privilege('anon', 'public._show_day(public.shows)', 'execute') as show_day_aperta,
       has_function_privilege('anon', 'public._outbox_off()', 'execute') as outbox_off_aperta,
       has_function_privilege('anon', 'public._founding_assign()', 'execute') as founding_aperta;
