# Avatar di Elena · pagina /join

Elena, in versione illustrata, entra nella sezione «Trasmetti con noi» e spiega in sei passi come si entra in Uniqaia: account, candidatura, valutazione entro 24 ore, link di pagamento, palinsesto, diretta. Alla fine il pulsante «Crea il tuo account» porta al modulo.

Stato al 4 novembre 2026: **in anteprima**, visibile solo con `uniqaia.com/join/?avatar=preview` (dopo il merge in main; per ora è sul ramo `avatar-elena`).
**Parla** in silenzio: mentre il fumetto si riempie, la bocca dice il testo sillaba per sillaba. Il suono arriva con la registrazione di Elena (o una voce sintetica che lei avrà approvato): vedi «Dare la voce».
**Si muove**: respira, sposta il peso, piega il busto, muove testa e capelli, alza il diamante e la lente.

## L'immagine (4 novembre 2026)

- `elena-illustrazione.png`: la figura nuova — giacca nera, lente 10x nella mano destra, diamante fra pollice e indice nella sinistra alzata.
- `elena-volto.png`: la prima illustrazione. Elena ne preferisce il volto (più realistico): `volto.py` lo trapianta nella figura nuova (stessa luce e tono di pelle; il viso è circa il 6% più largo che nell'originale, per riempire la testa nuova).
- Il 4 novembre Elena ha visto il volto trapiantato e ha chiesto di procedere. Un primo tentativo lasciava un'ombra sulla guancia sinistra: corretto allargando il viso (vedi il commento in `volto.py`).

## I pezzi

| Pezzo | Dove |
| --- | --- |
| Motore, fumetto, comandi | `show/_src/avatar.js` (incluso da `build.mjs` nella pagina /join al posto di `{{AVATAR}}`) |
| Testi in 5 lingue | `show/_src/avatar-copione.json` — unica fonte, la usano sia il fumetto sia la voce |
| Misure e pesi delle deformazioni | `show/_src/avatar-geometria.json` (lo scrive `prepara-livelli.py`, lo inserisce `build.mjs`) |
| Immagini del sito | `show/img/avatar/elena.webp` (figura scontornata), `elena-fx.webp` (occhi chiusi e tre aperture della bocca) |
| Preparazione delle immagini | `python3 ops/avatar/prepara-livelli.py` (scontorno, volto, varianti, pesi: riproduce i file identici) |
| Video per i social | `node ops/avatar/gira-video.mjs` → `ops/avatar/video/` |
| Immagini fisse | `ops/avatar/immagini/elena-avatar-trasparente.png` (sfondo trasparente), `elena-avatar-avorio.png` |
| Voce | `ops/avatar/genera-voce.mjs` → `show/img/avatar/voce/<lingua>/<passo>.mp3` |

## Video pronti (`ops/avatar/video/`)

Ogni scena in due versioni: `.webm` con sfondo trasparente (da mettere sopra qualsiasi grafica, 1076×1756) e `.mp4` su sfondo avorio Uniqaia. Senza audio.

| Scena | Durata | Cosa fa |
| --- | --- | --- |
| `elena-saluto-it` | 8 s | saluta (testa, diamante, riflesso) e dice «Sono la gemmologa GIA di Uniqaia. In sei passi ti spiego come si entra…» |
| `elena-lente-it` | 7 s | alza la lente e dice «Ti arriva subito un'email di conferma, e valutiamo il tuo brand entro 24 ore.» |
| `elena-diamante-it` | 8 s | mostra il diamante due volte mentre parla della diretta |
| `elena-attesa` | 8 s | non parla: respira, si muove, saluta e mostra il diamante (sfondo per un post o una storia) |

La bocca dice i testi del copione. Per un video con la voce: si registra la frase, si gira la scena con la bocca sull'audio (`UQAvatar.say(url)`) oppure si monta l'audio su una scena che dice le stesse parole. Nuove scene: si aggiungono in `SCENE` dentro `gira-video.mjs` (passo del copione, lingua, durata, gesti).

## Come si muove

Un'unica immagine deformata in WebGL da una griglia di circa 10 px, con una mappa di pesi che dice quanto ogni punto segue:
la testa (con la parte alta dei capelli), le punte dei capelli, l'avambraccio col diamante (gira sul gomito), la mano con la lente (gira sul polso), il busto (si piega sui fianchi). Più il respiro e lo spostamento del peso sui piedi. Fuori dalla figura ogni punto prende i pesi della parte più vicina, così i contorni si muovono interi.

- Gesti (`UQAvatar.gesture(nome)`): `hello` (saluto: testa, diamante, riflesso), `show` (alza e mostra il diamante), `loupe` (alza la lente), `lean` (si sporge verso il fumetto), `nod`, `tilt`, `beat`.
- Nei passi: saluto → `hello`; valutazione → `loupe`; palinsesto → `lean`; diretta e fine → `show`; gli altri un cenno.
- Ogni tanto un riflesso accende il diamante, su faccette diverse.
- Battito di ciglia: la palpebra scende, non dissolve.
- **Riduci animazioni** attivo o WebGL assente: immagine ferma, testo intero, si avanza a mano.
- Si ferma quando la sezione non è sullo schermo o la scheda è in secondo piano (batteria).
- Aspetta che la ruota di benvenuto sia chiusa prima di entrare.
- Arabo: la nicchia passa a destra, frecce e punti si specchiano, si sporge verso il fumetto a sinistra; la figura non si specchia.
- Passa da solo al passo successivo; si mette in pausa con il pulsante o tenendo il mouse sul fumetto. Il lettore di schermo legge ogni passo intero.

## Accendere per tutti

In `show/_src/avatar.js`: `var MODE = "anteprima";` → `"pubblico"`. Poi `node show/_src/build.mjs`, commit e push. `"spento"` lo toglie del tutto. Con `?avatar=off` lo si nasconde per la sessione. Serve l'OK di Elena.

## Dare la voce

1. Audio, un file per passo con il nome dell'`id` del copione: `saluto`, `account`, `candidatura`, `valutazione`, `attivazione`, `palinsesto`, `in-onda`, `fine` (`.mp3`), nella cartella `show/img/avatar/voce/<lingua>/`.
   - **Registrazione di Elena**: la via più autentica per italiano, inglese e francese.
   - **Voce sintetica**: solo una voce che Elena ha approvato. `ELEVENLABS_API_KEY=… ELEVENLABS_VOICE_ID=… node ops/avatar/genera-voce.mjs --lingue it,en,fr,ru,ar`.
2. `node ops/avatar/genera-voce.mjs --controlla` — verifica i file e aggiorna `VOICE_LANGS` con le lingue complete.
3. `node show/_src/build.mjs`, commit e push.

Da quel momento compare **Ascolta**: la voce parte solo con un clic (i browser bloccano l'audio automatico), la bocca segue l'ampiezza dell'audio con tre aperture, il testo del fumetto avanza con la voce, e a fine frase si passa al passo successivo. Senza clic resta il parlato muto.

Prova senza file audio: `?avatar=voce` usa la voce del browser e muove la bocca seguendo le sillabe del testo (solo anteprima).

## Regole (valgono per il sito, i video e i social)

- È un avatar: va sempre dichiarato come tale.
- Ogni frase che dice la approva Elena, in ogni lingua.
- Mai «certificata GIA» (in nessuna lingua): Elena è *GIA Graduate Gemologist*, «gemmologa diplomata GIA».
- Voce: solo quella di Elena o una voce sintetica approvata da lei.

## Se cambia il percorso

I testi descrivono il percorso seller del 4 novembre 2026 (`claude/percorso-seller.md`): 149 €/mese, 4 dirette da 60 minuti, serate alle 18/19/20, valutazione entro 24 ore, nessuna commissione. Se cambia uno di questi punti va aggiornato `avatar-copione.json` (e, se c'è la voce, rigenerato l'audio del passo; se ci sono video che dicono quella frase, rigirati). Russo e arabo vanno rivisti da un madrelingua.
