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

Tre valori in un file `.env.local` dentro questa cartella:

```
LIVEKIT_URL=wss://…livekit.cloud
LIVEKIT_API_KEY=…
LIVEKIT_API_SECRET=…
OPENAI_API_KEY=…
SUPABASE_URL=https://itoxzepuukyvdxxtfetf.supabase.co
SUPABASE_SERVICE_KEY=…
```

I primi tre esistono già (sono quelli della piattaforma). La chiave OpenAI
serve solo per la traduzione: a 5 $ di credito si coprono mesi di dirette.
La chiave Supabase è quella di servizio, che legge il glossario.

## Provarlo senza pubblico

```
pip install -r requirements.txt
lk agent console traduzione.py
```

Parla al microfono in italiano: in console compaiono le trascrizioni e le
traduzioni. Per vedere come appaiono nella pagina, basta aprire una diretta
con `?subs=demo` in fondo all'indirizzo.

## Metterlo online

```
lk agent create .
lk agent deploy
```

Da quel momento l'agent entra da solo in ogni stanza che lo richiede.

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
