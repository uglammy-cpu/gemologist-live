# Gemma, l'avatar di Elena · pagina /join

**Gemma** è la jewelry expert di Uniqaia: l'avatar animato di Elena Goglio, con il suo volto, che parla a nome suo (decisioni di Elena del 6 novembre 2026). Il nome vale per tutte e due le versioni. **Per motivi legali Gemma non si presenta mai come gemmologa GIA**: si dice «la jewelry expert della piattaforma» / «Uniqaia's jewelry expert». Contratto del rig (gerarchia, perni, limiti, gesti, collaudo, diritti): `RIG.md`.

> **Da cambiare prima di pubblicare**: il passo `saluto` del copione e il testo alternativo dicono ancora «Ciao, sono Elena» e «la gemmologa GIA di Uniqaia», in tutte le lingue. I video che li dicono (`elena-saluto-it`, `elena-libera-saluto-it`, `elena-libera-saluto-en`) **non si usano**. Le battute nuove le approva Elena.

Elena, in versione illustrata, entra nella sezione «Trasmetti con noi» e spiega in sei passi come si entra in Uniqaia: account, candidatura, valutazione entro 24 ore, link di pagamento, palinsesto, diretta. Alla fine il pulsante «Crea il tuo account» porta al modulo.

Stato al 4 novembre 2026: **in anteprima**, visibile solo con `uniqaia.com/join/?avatar=preview` (dopo il merge in main; per ora è sul ramo `avatar-elena`).
**Parla** in silenzio: mentre il fumetto si riempie, la bocca dice il testo sillaba per sillaba. Il suono arriva con la registrazione di Elena (o una voce sintetica che lei avrà approvato): vedi «Dare la voce».
**Si muove**: respira, sposta il peso, piega il busto, muove testa e capelli, alza il diamante e la lente.

**Due versioni** (6 novembre 2026, scelta di Elena), stesso motore:

| Figura | Cosa ha in mano | Dove si sceglie |
| --- | --- | --- |
| `diamante` (predefinita, quella di /join) | lente 10x e diamante | niente da fare |
| `libera` | niente: tutte e due le mani libere | `data-figura="libera"` sul contenitore, `UQAvatar.mount(slot, lingua, { figura: "libera" })`, oppure `?figura=libera` per le prove |

La figura `libera` è la prima illustrazione (`elena-volto.png`, il volto che Elena preferisce) senza la pochette: `togli-pochette.py` la toglie con un ritocco classico, senza IA generativa, e scrive `elena-mani-libere.png`. Serve al Marketing Manager per le attività sulla piattaforma e al Social Media Manager per Reel e TikTok.

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
| Figura a mani libere: immagine | `ops/avatar/togli-pochette.py` → `elena-mani-libere.png` |
| Figura a mani libere: livelli | `python3 ops/avatar/prepara-livelli-libera.py` → `show/img/avatar/elena-libera.webp`, `elena-libera-fx.webp`, `show/_src/avatar-geometria-libera.json`, immagini fisse `elena-libera-*.png` |
| Occhi chiusi e bocca aperta (tutte e due le figure) | `ops/avatar/volto_varianti.py` |

## Video pronti (`ops/avatar/video/`)

Ogni scena in due versioni: `.webm` con sfondo trasparente (da mettere sopra qualsiasi grafica, 1076×1756) e `.mp4` su sfondo avorio Uniqaia. Senza audio. Le scene a mani libere hanno anche `-9x16.mp4`: 1080×1920 su avorio a 30 fps, per Reels e TikTok, con la figura in basso e lo spazio sopra per i testi (le aree sicure dell'Editor restano: niente testo nei 250 px in alto).

| Scena | Durata | Cosa fa |
| --- | --- | --- |
| `elena-saluto-it` | 8 s | **non si usa** (dice «gemmologa GIA»). Saluta (testa, diamante, riflesso) e dice «Sono la gemmologa GIA di Uniqaia. In sei passi ti spiego come si entra…» |
| `elena-lente-it` | 7 s | alza la lente e dice «Ti arriva subito un'email di conferma, e valutiamo il tuo brand entro 24 ore.» |
| `elena-diamante-it` | 8 s | mostra il diamante due volte mentre parla della diretta |
| `elena-attesa` | 8 s | non parla: respira, si muove, saluta e mostra il diamante (sfondo per un post o una storia) |
| `elena-libera-saluto-it` | 8 s | **non si usa** (dice «gemmologa GIA»). Mani libere: saluta con la mano verso il fumetto, poi apre le braccia; dice «Sono la gemmologa GIA di Uniqaia. In sei passi ti spiego come si entra…» |
| `elena-libera-saluto-en` | 8 s | **non si usa** (dice «GIA gemologist»). La stessa scena, con la bocca che dice la battuta inglese del copione |
| `elena-libera-presenta-it` | 8 s | apre le braccia, poi indica il fumetto, mentre parla della diretta (passo «Vai in onda») |
| `elena-libera-attesa` | 8 s | non parla: respira, saluta, apre le braccia (sfondo per un post o una storia). **In loop**: l'ultimo secondo sfuma nel primo, ripetuta non ha scatti |

La bocca dice i testi del copione. Nuove scene mute: si aggiungono in `SCENE` dentro `gira-video.mjs` (figura, passo del copione, lingua, durata, gesti) e si girano con `node ops/avatar/gira-video.mjs --solo <id>`, oppure si descrivono in un file JSON e si girano con `--scena` (formato in `RIG.md`).

**Ripetibili**: ogni scena ha un seme (dal suo nome, o `--seme`) e l'orologio virtuale parte da zero, ingresso compreso: la stessa scena esce identica, fotogramma per fotogramma. **Collaudo del rig**: `node ops/avatar/collaudo-rig.mjs` → `ops/avatar/qa/` (pose, estremi, volto, ripetibilità), da rifare dopo ogni modifica.

## Scene con la voce di Elena

Per un Reel o un TikTok con la sua voce:

```
node ops/avatar/gira-video.mjs --audio registrazione.m4a --id smm-012-avatar --figura libera --gesti "0.3:hello,4:open,9:present"
```

- La bocca segue la registrazione, fotogramma per fotogramma, con le stesse tre aperture del pulsante «Ascolta» sul sito; l'audio entra nei tre file (`.webm`, `.mp4`, `-9x16.mp4`). La scena dura quanto l'audio, più mezzo secondo.
- `--gesti`: secondo e nome, separati da virgole. Mani libere: `hello`, `open`, `present`, `lean`, `nod`, `tilt`, `beat`. Diamante: `hello`, `show`, `loupe`, `lean`, `nod`, `tilt`, `beat`.
- `--out` per scegliere la cartella (predefinita `ops/avatar/video/`). I video con la voce non vanno nel repository pubblico finché Elena non li ha approvati: si girano in una cartella di lavoro.
- Solo la voce di Elena, o una voce sintetica che lei ha approvato. Le parole sono quelle dello script approvato.

## Come si muove

Un'unica immagine deformata in WebGL da una griglia di circa 10 px, con una mappa di pesi che dice quanto ogni punto segue:
la testa (con la parte alta dei capelli), le punte dei capelli, l'avambraccio col diamante (gira sul gomito), la mano con la lente (gira sul polso), il busto (si piega sui fianchi). Più il respiro e lo spostamento del peso sui piedi. Fuori dalla figura ogni punto prende i pesi della parte più vicina, così i contorni si muovono interi.

- Gesti (`UQAvatar.gesture(nome)`), figura con il diamante: `hello` (saluto: testa, diamante, riflesso), `show` (alza e mostra il diamante), `loupe` (alza la lente), `lean` (si sporge verso il fumetto), `nod`, `tilt`, `beat`.
- **Figura a mani libere** (movimento rifatto il 6 novembre 2026, richiesta di Elena: gesti naturali e variabili, mani sul parlato, postura, gambe e peso, transizioni morbide). Le braccia girano sulle spalle e gli avambracci anche sui gomiti (perni nella geometria: `elbow`/`lwrist` = spalle, `relbow`/`lelbow` = gomiti); le spalle salgono e scendono; i fianchi passano da un piede all'altro con i piedi fermi. Tre strati, sommati e poi passati da molle smorzate:
  - **postura**, che cambia ogni 3–6 secondi con transizioni di 1,2–2 secondi: peso su un piede (fianchi di lato, ginocchio dell'altra gamba verso l'interno, fianco libero che scende), busto che compensa (contrapposto) e ruota appena, testa che resta dritta, braccia a riposo ogni volta diverse;
  - **gesti** a curve (anticipazione, attacco, tenuta, rilascio), con ampiezze e tempi che cambiano ogni volta: `hello` (la mano verso il fumetto si alza e fa due cenni), `open` (apre le braccia), `present` (indica il fumetto con la mano aperta e si gira appena), `listen` (ascolta: si sporge, testa inclinata, quasi immobile), `think` (ci pensa: testa dall'altra parte, una spalla su), più `lean`, `nod`, `tilt`. Gli avambracci arrivano un attimo dopo le spalle;
  - **movimento secondario**: le mani seguono in ritardo i fianchi; micro-movimenti continui non periodici, un po' più vivi mentre parla.
- **Mani sul parlato** (solo a mani libere): una mano sottolinea le parole importanti, al massimo una ogni uno o due secondi. Dal fumetto: numeri, nomi con la maiuscola, parole lunghe, inizio della frase. Con «Ascolta» e nei video con `--audio`: l'inizio di ogni frase dopo una pausa e gli attacchi forti della voce. A mano: `UQAvatar.beat(forza 0–1)`.
- Limiti del 2D: gli avambracci si piegano al massimo di circa 15° (`foreRange`), perché la mano non può venire verso chi guarda; oltre si schiaccerebbe. Le mani non passano davanti al corpo. Niente riflesso. Su questa figura `show` diventa `open` e `loupe` diventa `present`. Con l'arabo saluta e indica con l'altro braccio, verso il fumetto a sinistra.
- La figura con il diamante non usa nulla di tutto questo: shader e fotogrammi identici a prima (verificato con caso e orologio bloccati).
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

- È un avatar: va sempre dichiarato come tale («Gemma, l'avatar animato di Elena Goglio»).
- Ogni frase che dice la approva Elena, in ogni lingua.
- Gemma è «la jewelry expert della piattaforma»: mai «gemmologa GIA», «GIA gemologist», «certificata GIA» né il logo GIA, in nessuna lingua.
- Voce: solo quella di Elena o una voce sintetica approvata da lei.

## Se cambia il percorso

I testi descrivono il percorso seller del 4 novembre 2026 (`claude/percorso-seller.md`): 149 €/mese, 4 dirette da 60 minuti, serate alle 18/19/20, valutazione entro 24 ore, nessuna commissione. Se cambia uno di questi punti va aggiornato `avatar-copione.json` (e, se c'è la voce, rigenerato l'audio del passo; se ci sono video che dicono quella frase, rigirati). Russo e arabo vanno rivisti da un madrelingua.
