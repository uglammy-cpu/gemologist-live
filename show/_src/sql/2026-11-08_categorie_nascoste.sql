-- 8/11/2026, decisione di Elena: le categorie vecchie non si tolgono, si NASCONDONO.
-- Restano nel database e sui seller e sulle dirette che le hanno già; spariscono dalle scelte
-- (modulo /join, pannello dei seller, schede). Copia di sicurezza: backup.categories_20261108.
-- Per farle ricomparire: update public.categories set active = true where slug in (...);
update public.categories set active = false
 where active
   and slug not in ('nuovi-talenti', 'fatto-a-mano', 'made-in-italy', 'gioielli-indiani', 'gemme-di-colore', 'perle');
