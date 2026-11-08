-- 8/11/2026, OK di Elena: ogni serata usa la categoria della sua pagina (/c/...), e le sei categorie prendono i nomi della home.
-- Prima: mercoledì -> diamanti-naturali, giovedì -> gemme-di-colore (pagina Specials!), sabato -> oro-14kt.
-- Copie di sicurezza nello schema backup.
create table if not exists backup.night_template_20261108 as select * from public.night_template;
create table if not exists backup.nights_20261108 as select * from public.nights;
create table if not exists backup.categories_20261108 as select * from public.categories;

-- la prima categoria del modello è quella che la serata (e ogni diretta prenotata con book_live) prende
update public.night_template set categories = '{made-in-italy,diamanti-naturali,lab-grown}' where weekday = 3;  -- The Classics
update public.night_template set categories = '{fatto-a-mano,pietre-sciolte}' where weekday = 4;                -- The Gem Room
update public.night_template set categories = '{gemme-di-colore}' where weekday = 6;                            -- Specials

-- serate future già generate (le domeniche a rotazione sono già giuste)
update public.nights n set category = t.categories[1], categories = t.categories
  from public.night_template t
 where n.starts_at > now() and not t.rotating and t.weekday in (3, 4, 6)
   and t.weekday = extract(dow from n.starts_at at time zone 'Europe/Rome')::int;

-- nomi delle sei categorie come in home (pannello dei seller, schede, modulo di candidatura), nello stesso ordine
update public.categories c
   set name_i18n = jsonb_build_object('it', v.name, 'en', v.name, 'fr', v.name, 'ar', v.name, 'ru', v.name), position = v.pos
  from (values ('nuovi-talenti', 'Independent Designers', 10), ('fatto-a-mano', 'The Gem Room', 20), ('made-in-italy', 'The Classics', 25),
               ('gioielli-indiani', 'Collection', 27), ('gemme-di-colore', 'Specials', 28), ('perle', 'Pearls & Corals', 29)) as v(slug, name, pos)
 where c.slug = v.slug;
