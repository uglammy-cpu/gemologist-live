# Agent di traduzione

Trascrive l'italiano della diretta e pubblica i sottotitoli tradotti in
inglese, francese, russo e arabo. Gira su LiveKit Cloud, accanto alla stanza
della diretta: non serve altro server.

## Cosa fa, in una riga

Ascolta → trascrive una volta sola → traduce in parallelo nelle quattro
lingue usando il glossario gemmologico → pubblica un canale di testo per
lingua (`sub.it`, `sub.en`, `sub.fr`, `sub.ru`, `sub.ar`), che la pagina
della diretta mostra nella fascia sotto il video.

## Cosa serve prima di accenderlo

Un file `.env.local` con le chiavi LiveKit della piattaforma e l'indirizzo
di Supabase con la chiave pubblicabile. Nessun contratto nuovo: trascrizione
e traduzione passano dai modelli fatturati da LiveKit.

## Avviarlo

Su Windows basta il doppio clic su `AVVIA.bat`: prepara l'ambiente la prima
volta, poi si collega a LiveKit e aspetta. Finché la finestra resta aperta,
l'agent entra da solo in ogni diretta che si apre.

A mano, su qualunque sistema:

```
pip install -r requirements.txt
python traduzione.py dev
```

Per vedere come appaiono i sottotitoli nella pagina senza una diretta in
corso, aprire una diretta con `?subs=demo` in fondo all'indirizzo.

## Costo

Circa un dollaro per un'ora di diretta con quattro lingue attive, qualunque
sia il numero di spettatori: l'audio viene elaborato una volta sola e il
risultato distribuito a tutti.

## Il glossario

Sta nella tabella `glossary` su Supabase. Ogni riga è un termine italiano con
la resa nelle quattro lingue, le pronunce alternative per la trascrizione e
una nota che spiega quando si usa. L'agent lo carica all'avvio, quindi un
termine aggiunto vale dalla diretta successiva.

I termini di partenza sono stati scritti senza una revisione madrelingua per
russo e arabo: prima di aprire quelle due lingue al pubblico vanno riletti
da qualcuno che le parla.
