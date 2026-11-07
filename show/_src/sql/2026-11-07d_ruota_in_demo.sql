-- Uniqaia — The Jeweler's Wheel in demo (decisione di Elena del 7/11/2026 alle 13:56, dopo LEG-004 del Legal)
-- Il pubblico non vede più la ruota; Elena la vede con ?wheel=preview. Si riaccende dal pannello /wheel-admin.
-- I due giri pubblici del 4/11 (Gold, 119 €, provvisori e senza account) restano come sono.
-- Dove: Supabase, progetto itoxzepuukyvdxxtfetf → SQL Editor → New query → incolla tutto → Run.
begin;

update public.wheel_config set mode = 'demo', updated_at = now() where id = 1;

insert into public.wheel_audit (actor, action, detail)
values ('Marketing Manager, con l''OK di Elena', 'mode',
        jsonb_build_object('mode', 'demo', 'motivo', 'LEG-004: rischio DPR 430/2001, decisione di Elena del 7/11/2026 alle 13:56'));

commit;

-- Controllo: deve dare demo.
select mode, updated_at from public.wheel_config where id = 1;
